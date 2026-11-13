from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Response
from sqlalchemy.orm import Session

from app.api.deps import current_user, get_auth_settings, get_email, get_session, utc_now
from app.auth import service
from app.incidents import service as incidents
from app.auth.email import EmailSender
from app.config import AuthSettings
from app.models import User
from app.schemas import (
    AccountSummary, ChangePasswordIn, EmailCodeIn, EmailIn, LoginIn, MessageOut, PasswordIn, ProfileIn, RegisterIn,
    ResetPasswordIn, SessionOut, UserOut,
)

router = APIRouter(tags=["auth"])

CODE_SENT = "if an account exists for this email, a code is on its way"

# The refresh token lives in an httpOnly cookie that page scripts cannot read, sent only to the auth endpoints
# and only from Sarathi's own pages (SameSite=Strict), which also blocks cross-site requests that use it.
REFRESH_COOKIE = "sarathi_refresh"
COOKIE_PATH = "/api/auth"
RefreshCookie = Annotated[str | None, Cookie(alias=REFRESH_COOKIE)]


def start_session(response: Response, settings: AuthSettings, user: User, tokens: service.TokenPair) -> SessionOut:
    """Set the refresh cookie and return the access token and user."""
    response.set_cookie(REFRESH_COOKIE, tokens.refresh_token, max_age=settings.refresh_token_days * 86400,
                        path=COOKIE_PATH, secure=settings.cookie_secure, httponly=True, samesite="strict")
    return SessionOut(access_token=tokens.access_token, expires_in=tokens.expires_in,
                      user=UserOut.model_validate(user))


def require_cookie(token: str | None) -> str:
    """The refresh token from the cookie, or a 401 if the browser has none."""
    if not token:
        raise service.InvalidRefreshToken("not signed in")
    return token


@router.post("/auth/register", response_model=UserOut, status_code=201)
def register(body: RegisterIn, session: Session = Depends(get_session),
             settings: AuthSettings = Depends(get_auth_settings), sender: EmailSender = Depends(get_email)) -> UserOut:
    """Create an account and email a 6-digit verification code."""
    user = service.register(session, settings, sender, body.full_name, body.email, body.password, utc_now())
    return UserOut.model_validate(user)


@router.post("/auth/verify-email", response_model=SessionOut)
def verify_email(body: EmailCodeIn, response: Response, session: Session = Depends(get_session),
                 settings: AuthSettings = Depends(get_auth_settings)) -> SessionOut:
    """Confirm an email address with the emailed code and sign in."""
    now = utc_now()
    user = service.verify_email(session, settings, body.email, body.code, now)
    return start_session(response, settings, user, service.issue_tokens(session, settings, user, now))


@router.post("/auth/resend-code", response_model=MessageOut, status_code=202)
def resend_code(body: EmailIn, session: Session = Depends(get_session),
                settings: AuthSettings = Depends(get_auth_settings),
                sender: EmailSender = Depends(get_email)) -> MessageOut:
    """Send a new verification code (same answer whether or not the account exists)."""
    service.request_code(session, settings, sender, body.email, "verify", utc_now())
    return MessageOut(message=CODE_SENT)


@router.post("/auth/login", response_model=SessionOut)
def login(body: LoginIn, response: Response, session: Session = Depends(get_session),
          settings: AuthSettings = Depends(get_auth_settings)) -> SessionOut:
    """Sign in with email and password."""
    return start_session(response, settings, *service.login(session, settings, body.email, body.password, utc_now()))


@router.post("/auth/refresh", response_model=SessionOut)
def refresh(response: Response, token: RefreshCookie = None, session: Session = Depends(get_session),
            settings: AuthSettings = Depends(get_auth_settings)) -> SessionOut:
    """Get a new access token from the session cookie; the cookie's token is replaced each time."""
    return start_session(response, settings, *service.refresh(session, settings, require_cookie(token), utc_now()))


def signed_out(settings: AuthSettings) -> Response:
    """An empty reply that removes the session cookie."""
    response = Response(status_code=204)
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH, secure=settings.cookie_secure, httponly=True,
                           samesite="strict")
    return response


@router.post("/auth/logout", status_code=204)
def logout(token: RefreshCookie = None, session: Session = Depends(get_session),
           settings: AuthSettings = Depends(get_auth_settings)) -> Response:
    """Sign out of this session and remove the cookie."""
    if token:
        service.logout(session, token, utc_now())
    return signed_out(settings)


@router.post("/auth/logout-all", status_code=204)
def logout_all(user: User = Depends(current_user), session: Session = Depends(get_session),
               settings: AuthSettings = Depends(get_auth_settings)) -> Response:
    """Sign out of every device, this one included."""
    service.logout_everywhere(session, user, utc_now())
    return signed_out(settings)


@router.post("/auth/change-password", status_code=204)
def change_password(body: ChangePasswordIn, token: RefreshCookie = None, user: User = Depends(current_user),
                    session: Session = Depends(get_session)) -> Response:
    """Change the password (the current one is needed); other devices are signed out, this one stays."""
    service.change_password(session, user, body.current_password, body.new_password, token, utc_now())
    return Response(status_code=204)


@router.post("/auth/forgot-password", response_model=MessageOut, status_code=202)
def forgot_password(body: EmailIn, session: Session = Depends(get_session),
                    settings: AuthSettings = Depends(get_auth_settings),
                    sender: EmailSender = Depends(get_email)) -> MessageOut:
    """Email a password reset code (same answer whether or not the account exists)."""
    service.request_code(session, settings, sender, body.email, "reset", utc_now())
    return MessageOut(message=CODE_SENT)


@router.post("/auth/reset-password", response_model=MessageOut)
def reset_password(body: ResetPasswordIn, session: Session = Depends(get_session),
                   settings: AuthSettings = Depends(get_auth_settings)) -> MessageOut:
    """Set a new password with the emailed code; signs out all other sessions."""
    service.reset_password(session, settings, body.email, body.code, body.new_password, utc_now())
    return MessageOut(message="password changed; please log in")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> UserOut:
    """The signed-in user's account."""
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileIn, user: User = Depends(current_user),
              session: Session = Depends(get_session)) -> UserOut:
    """Change the name on the account."""
    return UserOut.model_validate(service.update_profile(session, user, body.full_name))


@router.get("/me/summary", response_model=AccountSummary)
def my_summary(user: User = Depends(current_user), session: Session = Depends(get_session)) -> AccountSummary:
    """How many hazards the signed-in user has reported and how many were verified."""
    return AccountSummary.model_validate(incidents.report_counts(session, user))


@router.post("/me/delete", status_code=204)
def delete_me(body: PasswordIn, user: User = Depends(current_user), session: Session = Depends(get_session),
              settings: AuthSettings = Depends(get_auth_settings)) -> Response:
    """Delete the account for good (the password is needed); reports stay on the map without a name."""
    service.delete_account(session, user, body.password, utc_now())
    return signed_out(settings)
