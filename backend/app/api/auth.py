from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api.deps import current_user, get_auth_settings, get_email, get_session, utc_now
from app.auth import service
from app.auth.email import EmailSender
from app.config import AuthSettings
from app.models import User
from app.schemas import (
    EmailCodeIn, EmailIn, LoginIn, MessageOut, RefreshIn, RegisterIn, ResetPasswordIn, TokenOut, UserOut,
)

router = APIRouter(tags=["auth"])

CODE_SENT = "if an account exists for this email, a code is on its way"


def token_out(user: User, tokens: service.TokenPair) -> TokenOut:
    """Response body for a successful sign-in or refresh."""
    return TokenOut(access_token=tokens.access_token, refresh_token=tokens.refresh_token,
                    expires_in=tokens.expires_in, user=UserOut.model_validate(user))


@router.post("/auth/register", response_model=UserOut, status_code=201)
def register(body: RegisterIn, session: Session = Depends(get_session),
             settings: AuthSettings = Depends(get_auth_settings), sender: EmailSender = Depends(get_email)) -> UserOut:
    """Create an account and email a 6-digit verification code."""
    user = service.register(session, settings, sender, body.full_name, body.email, body.password, utc_now())
    return UserOut.model_validate(user)


@router.post("/auth/verify-email", response_model=UserOut)
def verify_email(body: EmailCodeIn, session: Session = Depends(get_session),
                 settings: AuthSettings = Depends(get_auth_settings)) -> UserOut:
    """Confirm an email address with the emailed code."""
    return UserOut.model_validate(service.verify_email(session, settings, body.email, body.code, utc_now()))


@router.post("/auth/resend-code", response_model=MessageOut, status_code=202)
def resend_code(body: EmailIn, session: Session = Depends(get_session),
                settings: AuthSettings = Depends(get_auth_settings),
                sender: EmailSender = Depends(get_email)) -> MessageOut:
    """Send a new verification code (same answer whether or not the account exists)."""
    service.request_code(session, settings, sender, body.email, "verify", utc_now())
    return MessageOut(message=CODE_SENT)


@router.post("/auth/login", response_model=TokenOut)
def login(body: LoginIn, session: Session = Depends(get_session),
          settings: AuthSettings = Depends(get_auth_settings)) -> TokenOut:
    """Sign in with email and password."""
    return token_out(*service.login(session, settings, body.email, body.password, utc_now()))


@router.post("/auth/refresh", response_model=TokenOut)
def refresh(body: RefreshIn, session: Session = Depends(get_session),
            settings: AuthSettings = Depends(get_auth_settings)) -> TokenOut:
    """Get a new access token; the refresh token is replaced each time."""
    return token_out(*service.refresh(session, settings, body.refresh_token, utc_now()))


@router.post("/auth/logout", status_code=204)
def logout(body: RefreshIn, session: Session = Depends(get_session)) -> Response:
    """Sign out of this session."""
    service.logout(session, body.refresh_token, utc_now())
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
