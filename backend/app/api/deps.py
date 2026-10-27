from collections.abc import Iterator
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import Connection
from sqlalchemy.orm import Session

from app.auth.email import EmailSender
from app.auth.tokens import InvalidToken, decode_access_token
from app.config import AuthSettings
from app.models import User
from app.state import RoutingState

bearer = HTTPBearer(auto_error=False)


def get_routing(request: Request) -> RoutingState:
    """The in-memory road graph and facilities loaded at startup."""
    return request.app.state.routing


def get_conn(request: Request) -> Iterator[Connection]:
    """A database connection for the length of one request."""
    with request.app.state.engine.connect() as conn:
        yield conn


def get_session(request: Request) -> Iterator[Session]:
    """An ORM session for the length of one request."""
    with Session(request.app.state.engine, expire_on_commit=False) as session:
        yield session


def get_auth_settings(request: Request) -> AuthSettings:
    """Token lifetimes, secret and email settings."""
    return request.app.state.auth


def get_email(request: Request) -> EmailSender:
    """Where verification and reset emails go."""
    return request.app.state.email


def utc_now() -> datetime:
    """The current time in UTC."""
    return datetime.now(timezone.utc)


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
                 settings: AuthSettings = Depends(get_auth_settings),
                 session: Session = Depends(get_session)) -> User:
    """The signed-in user from the Authorization: Bearer token."""
    if credentials is None:
        raise HTTPException(401, "not signed in", headers={"WWW-Authenticate": "Bearer"})
    try:
        user_id = decode_access_token(settings, credentials.credentials)
    except InvalidToken as exc:
        raise HTTPException(401, str(exc), headers={"WWW-Authenticate": "Bearer"}) from None
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(401, "account no longer exists", headers={"WWW-Authenticate": "Bearer"})
    if user.status == "suspended":
        raise HTTPException(403, "this account has been suspended")
    return user


def verified_user(user: User = Depends(current_user)) -> User:
    """A signed-in user who has confirmed their email (needed to report hazards)."""
    if not user.email_verified:
        raise HTTPException(403, "verify your email address first")
    return user


def moderator(user: User = Depends(current_user)) -> User:
    """A signed-in moderator."""
    if user.role != "moderator":
        raise HTTPException(403, "moderators only")
    return user
