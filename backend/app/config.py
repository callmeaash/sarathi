import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BACKEND_DIR / ".env")

MIN_SECRET_LENGTH = 32


def database_url() -> str:
    """Return the database URL from the environment or backend/.env."""
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set. Copy backend/.env.example to backend/.env and fill it in.")
    return url


@dataclass(frozen=True)
class AuthSettings:
    jwt_secret: str
    access_token_minutes: int = 30
    refresh_token_days: int = 30
    code_minutes: int = 15
    email_backend: str = "console"  # console: print emails to the log; smtp: send them
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "Sarathi <no-reply@sarathi.app>"


def load_auth_settings() -> AuthSettings:
    """Read auth and email settings from the environment or backend/.env."""
    secret = os.getenv("JWT_SECRET", "")
    if len(secret) < MIN_SECRET_LENGTH:
        raise RuntimeError(f"JWT_SECRET must be set to at least {MIN_SECRET_LENGTH} random characters in backend/.env")
    backend = os.getenv("EMAIL_BACKEND", "console")
    if backend not in ("console", "smtp"):
        raise RuntimeError("EMAIL_BACKEND must be 'console' or 'smtp'")
    if backend == "smtp" and not os.getenv("SMTP_HOST"):
        raise RuntimeError("EMAIL_BACKEND=smtp needs SMTP_HOST (and usually SMTP_USER and SMTP_PASSWORD)")
    return AuthSettings(
        jwt_secret=secret,
        access_token_minutes=int(os.getenv("ACCESS_TOKEN_MINUTES", "30")),
        refresh_token_days=int(os.getenv("REFRESH_TOKEN_DAYS", "30")),
        email_backend=backend,
        smtp_host=os.getenv("SMTP_HOST", ""),
        smtp_port=int(os.getenv("SMTP_PORT", "587")),
        smtp_user=os.getenv("SMTP_USER", ""),
        smtp_password=os.getenv("SMTP_PASSWORD", ""),
        smtp_from=os.getenv("SMTP_FROM", AuthSettings.smtp_from),
    )
