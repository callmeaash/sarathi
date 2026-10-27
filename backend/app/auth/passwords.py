from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128  # long enough for passphrases, short enough to stop hashing huge inputs
COMMON_PASSWORDS = {"password", "password1", "12345678", "123456789", "1234567890", "qwerty123", "11111111",
                    "abcd1234", "iloveyou", "nepal123", "kathmandu", "sarathi1"}

_hasher = PasswordHasher()
# Hash checked when the email is unknown, so a failed login takes the same time either way.
DUMMY_HASH = _hasher.hash("not-a-real-password")


def password_problem(password: str, email: str = "") -> str | None:
    """Return why a password is not acceptable, or None if it is fine."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"password must be at least {MIN_PASSWORD_LENGTH} characters"
    if len(password) > MAX_PASSWORD_LENGTH:
        return f"password must be at most {MAX_PASSWORD_LENGTH} characters"
    if not password.strip():
        return "password cannot be only spaces"
    if password.lower() in COMMON_PASSWORDS:
        return "this password is too common"
    if email and password.lower() == email.lower().split("@")[0]:
        return "password must not be the same as your email name"
    return None


def hash_password(password: str) -> str:
    """Hash a password with Argon2."""
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    """Return True if the password matches the stored hash."""
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    """Return True if the hash was made with older Argon2 settings."""
    return _hasher.check_needs_rehash(password_hash)
