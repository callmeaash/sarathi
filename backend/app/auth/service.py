import math
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.email import EmailSender, code_email
from app.auth.passwords import DUMMY_HASH, hash_password, needs_rehash, password_problem, verify_password
from app.auth.tokens import codes_match, create_access_token, hash_code, hash_token, new_code, new_refresh_token
from app.config import AuthSettings
from app.models import USER_ROLES, EmailCode, RefreshToken, User

MAX_CODE_ATTEMPTS = 5
RESEND_COOLDOWN = timedelta(seconds=60)
MAX_CODES_PER_HOUR = 5
MAX_FAILED_LOGINS = 10
LOCK_DURATION = timedelta(minutes=15)
MAX_NAME_LENGTH = 100


class AuthError(Exception):
    status_code = 400

    def __init__(self, detail: str, retry_after: int | None = None):
        """Error with a message for the client and, for rate limits, seconds to wait."""
        super().__init__(detail)
        self.detail = detail
        self.retry_after = retry_after


class InvalidInput(AuthError):
    status_code = 422


class EmailTaken(AuthError):
    status_code = 409


class InvalidCredentials(AuthError):
    status_code = 401


class InvalidRefreshToken(AuthError):
    status_code = 401


class InvalidCode(AuthError):
    status_code = 400


class AccountSuspended(AuthError):
    status_code = 403


class TooManyRequests(AuthError):
    status_code = 429


@dataclass
class TokenPair:
    access_token: str
    refresh_token: str
    expires_in: int  # seconds until the access token expires


def seconds_until(moment: datetime, now: datetime) -> int:
    """Whole seconds from now until a moment, at least 1."""
    return max(1, math.ceil((moment - now).total_seconds()))


def normalise_email(email: str) -> str:
    """Emails are compared and stored in lower case without surrounding spaces."""
    return email.strip().lower()


def find_user(session: Session, email: str) -> User | None:
    """Look up a user by email."""
    return session.scalar(select(User).where(User.email == normalise_email(email)))


def send_code(session: Session, settings: AuthSettings, sender: EmailSender, user: User, purpose: str,
              now: datetime) -> None:
    """Email a new code, replacing any unused one, within the resend limits."""
    recent = session.scalars(select(EmailCode).where(
        EmailCode.user_id == user.id, EmailCode.purpose == purpose, EmailCode.created_at > now - timedelta(hours=1),
    ).order_by(EmailCode.created_at.desc())).all()
    if recent and recent[0].created_at > now - RESEND_COOLDOWN:
        raise TooManyRequests("please wait before asking for another code",
                              seconds_until(recent[0].created_at + RESEND_COOLDOWN, now))
    if len(recent) >= MAX_CODES_PER_HOUR:
        raise TooManyRequests("too many codes requested; try again later",
                              seconds_until(recent[-1].created_at + timedelta(hours=1), now))

    session.execute(update(EmailCode).where(
        EmailCode.user_id == user.id, EmailCode.purpose == purpose, EmailCode.used_at.is_(None),
    ).values(used_at=now))
    code = new_code()
    session.add(EmailCode(user_id=user.id, purpose=purpose, code_hash=hash_code(settings, user.id, purpose, code),
                          created_at=now, expires_at=now + timedelta(minutes=settings.code_minutes)))
    session.commit()
    sender.send(user.email, *code_email(purpose, code, user.full_name, settings.code_minutes))


def register(session: Session, settings: AuthSettings, sender: EmailSender, full_name: str, email: str,
             password: str, now: datetime) -> User:
    """Create an unverified account and email it a verification code."""
    email, full_name = normalise_email(email), " ".join(full_name.split())
    if not full_name or len(full_name) > MAX_NAME_LENGTH:
        raise InvalidInput(f"full name must be 1 to {MAX_NAME_LENGTH} characters")
    if problem := password_problem(password, email):
        raise InvalidInput(problem)
    if find_user(session, email):
        raise EmailTaken("an account with this email already exists")
    user = User(email=email, full_name=full_name, password_hash=hash_password(password), created_at=now)
    session.add(user)
    try:
        session.flush()
    except IntegrityError:  # someone registered the same email at the same moment
        session.rollback()
        raise EmailTaken("an account with this email already exists") from None
    send_code(session, settings, sender, user, "verify", now)
    return user


def request_code(session: Session, settings: AuthSettings, sender: EmailSender, email: str, purpose: str,
                 now: datetime) -> None:
    """Resend a verification code or send a reset code; silent about whether the account exists."""
    user = find_user(session, email)
    if user is None or user.status != "active" or (purpose == "verify" and user.email_verified):
        return
    try:
        send_code(session, settings, sender, user, purpose, now)
    except TooManyRequests:
        session.rollback()  # same answer as success, so the response reveals nothing


def check_code(session: Session, settings: AuthSettings, user: User, purpose: str, code: str,
               now: datetime) -> None:
    """Accept the user's latest code once; count wrong attempts and stop after too many."""
    row = session.scalar(select(EmailCode).where(
        EmailCode.user_id == user.id, EmailCode.purpose == purpose, EmailCode.used_at.is_(None),
    ).order_by(EmailCode.created_at.desc()).limit(1))
    if row is None or row.expires_at <= now or row.attempts >= MAX_CODE_ATTEMPTS:
        raise InvalidCode("this code is invalid or has expired; ask for a new one")
    if not codes_match(row.code_hash, hash_code(settings, user.id, purpose, code.strip())):
        row.attempts += 1
        session.commit()
        left = MAX_CODE_ATTEMPTS - row.attempts
        raise InvalidCode(f"incorrect code; {left} attempt{'s' if left != 1 else ''} left" if left
                          else "incorrect code; ask for a new one")
    row.used_at = now


def verify_email(session: Session, settings: AuthSettings, email: str, code: str, now: datetime) -> User:
    """Mark an account's email as verified with the emailed code."""
    user = find_user(session, email)
    if user is None:
        raise InvalidCode("this code is invalid or has expired; ask for a new one")
    if not user.email_verified:
        check_code(session, settings, user, "verify", code, now)
        user.email_verified = True
        session.commit()
    return user


def issue_tokens(session: Session, settings: AuthSettings, user: User, now: datetime) -> TokenPair:
    """Create an access token and a stored refresh token for a user."""
    raw = new_refresh_token()
    session.add(RefreshToken(user_id=user.id, token_hash=hash_token(raw), created_at=now,
                             expires_at=now + timedelta(days=settings.refresh_token_days)))
    session.commit()
    return TokenPair(create_access_token(settings, user.id, user.role, now), raw, settings.access_token_minutes * 60)


def login(session: Session, settings: AuthSettings, email: str, password: str,
          now: datetime) -> tuple[User, TokenPair]:
    """Check the password and sign in, locking the account briefly after repeated failures."""
    user = find_user(session, email)
    if user is None:
        verify_password(DUMMY_HASH, password)  # same work as a real check, so timing reveals nothing
        raise InvalidCredentials("incorrect email or password")
    if user.locked_until and user.locked_until > now:
        raise TooManyRequests("too many failed attempts; try again later", seconds_until(user.locked_until, now))
    if not verify_password(user.password_hash, password):
        user.failed_logins += 1
        if user.failed_logins >= MAX_FAILED_LOGINS:
            user.failed_logins, user.locked_until = 0, now + LOCK_DURATION
        session.commit()
        raise InvalidCredentials("incorrect email or password")
    if user.status == "suspended":
        raise AccountSuspended("this account has been suspended")
    user.failed_logins, user.locked_until, user.last_login_at = 0, None, now
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    return user, issue_tokens(session, settings, user, now)


def revoke_all_tokens(session: Session, user_id: int, now: datetime, reason: str) -> None:
    """Sign a user out everywhere."""
    session.execute(update(RefreshToken).where(
        RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None),
    ).values(revoked_at=now, revoke_reason=reason))


def refresh(session: Session, settings: AuthSettings, raw_token: str, now: datetime) -> tuple[User, TokenPair]:
    """Swap a refresh token for a new pair; reuse of an old token signs the user out everywhere."""
    row = session.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token)))
    if row is None:
        raise InvalidRefreshToken("invalid refresh token")
    if row.revoked_at is not None:
        if row.revoke_reason == "rotated":
            # A token that was already swapped for a new one is back: it was copied. End every session.
            revoke_all_tokens(session, row.user_id, now, "reuse")
            session.commit()
        raise InvalidRefreshToken("this session has ended; please log in again")
    if row.expires_at <= now:
        raise InvalidRefreshToken("this session has expired; please log in again")
    user = session.get(User, row.user_id)
    if user.status == "suspended":
        revoke_all_tokens(session, user.id, now, "suspended")
        session.commit()
        raise AccountSuspended("this account has been suspended")
    row.revoked_at, row.revoke_reason = now, "rotated"
    return user, issue_tokens(session, settings, user, now)


def logout(session: Session, raw_token: str, now: datetime) -> None:
    """End one session by revoking its refresh token."""
    row = session.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token)))
    if row is not None and row.revoked_at is None:
        row.revoked_at, row.revoke_reason = now, "logout"
        session.commit()


def reset_password(session: Session, settings: AuthSettings, email: str, code: str, new_password: str,
                   now: datetime) -> None:
    """Set a new password with an emailed reset code and sign out all existing sessions."""
    user = find_user(session, email)
    if user is None:
        raise InvalidCode("this code is invalid or has expired; ask for a new one")
    if problem := password_problem(new_password, user.email):
        raise InvalidInput(problem)
    check_code(session, settings, user, "reset", code, now)
    user.password_hash = hash_password(new_password)
    user.email_verified = True  # they just proved they can read this inbox
    user.failed_logins, user.locked_until = 0, None
    revoke_all_tokens(session, user.id, now, "reset")
    session.commit()


def set_role(session: Session, email: str, role: str) -> User:
    """Change a user's role (used to create the first moderator)."""
    if role not in USER_ROLES:
        raise InvalidInput(f"role must be one of {', '.join(USER_ROLES)}")
    user = find_user(session, email)
    if user is None:
        raise InvalidInput(f"no user with email {normalise_email(email)}")
    user.role = role
    session.commit()
    return user
