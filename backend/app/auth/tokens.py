import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

import jwt

from app.config import AuthSettings

ALGORITHM = "HS256"
CODE_DIGITS = 6


class InvalidToken(Exception):
    pass


def create_access_token(settings: AuthSettings, user_id: int, role: str, now: datetime) -> str:
    """Create a short-lived signed access token for a user."""
    payload = {"sub": str(user_id), "role": role, "type": "access", "iat": now,
               "exp": now + timedelta(minutes=settings.access_token_minutes)}
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_access_token(settings: AuthSettings, token: str) -> int:
    """Check an access token's signature and expiry and return the user id."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM],
                             options={"require": ["exp", "iat", "sub"]})
    except jwt.ExpiredSignatureError:
        raise InvalidToken("token has expired") from None
    except jwt.InvalidTokenError:
        raise InvalidToken("invalid token") from None
    if payload.get("type") != "access" or not str(payload["sub"]).isdigit():
        raise InvalidToken("invalid token")
    return int(payload["sub"])


def new_refresh_token() -> str:
    """Create a random refresh token."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Hash a refresh token for storage."""
    return hashlib.sha256(token.encode()).hexdigest()


def new_code() -> str:
    """Create a random 6-digit code."""
    return f"{secrets.randbelow(10 ** CODE_DIGITS):0{CODE_DIGITS}d}"


def hash_code(settings: AuthSettings, user_id: int, purpose: str, code: str) -> str:
    """Keyed hash of a code, tied to its user and purpose so it cannot be reused elsewhere."""
    message = f"{user_id}:{purpose}:{code}".encode()
    return hmac.new(settings.jwt_secret.encode(), message, hashlib.sha256).hexdigest()


def codes_match(expected_hash: str, actual_hash: str) -> bool:
    """Compare two code hashes in constant time."""
    return hmac.compare_digest(expected_hash, actual_hash)
