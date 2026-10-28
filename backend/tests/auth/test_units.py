import smtplib
from dataclasses import replace
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException

from app.api.deps import moderator, verified_user
from app.auth.email import SmtpEmail, build_message
from app.auth.messages import LOGO_CID, Email, code_email
from app.auth.passwords import hash_password, password_problem, verify_password
from app.auth.tokens import (
    InvalidToken, create_access_token, decode_access_token, hash_code, hash_token, new_code, new_refresh_token,
)
from app.config import AuthSettings
from app.models import User
from tests.conftest import TEST_AUTH

NOW = datetime(2026, 10, 27, 12, 0, tzinfo=timezone.utc)


@pytest.mark.parametrize("password, email, problem", [
    ("short", "", "at least 8"),
    ("x" * 129, "", "at most 128"),
    ("         ", "", "only spaces"),
    ("Password", "", "too common"),
    ("kathmandu", "", "too common"),
    ("ramesh.karki", "ramesh.karki@example.com", "same as your email"),
])
def test_password_problems(password, email, problem):
    assert problem in password_problem(password, email)


@pytest.mark.parametrize("password", ["correct horse battery", "Kalimati-2026!", "पासवर्ड१२३४५६"])
def test_acceptable_passwords(password):
    assert password_problem(password, "someone@example.com") is None


def test_password_hashing():
    hashed = hash_password("correct horse battery")
    assert hashed.startswith("$argon2") and "correct" not in hashed
    assert verify_password(hashed, "correct horse battery")
    assert not verify_password(hashed, "correct horse batterY")
    assert not verify_password("not a hash", "anything")
    assert hash_password("same") != hash_password("same")  # salted


def test_access_token_round_trip():
    token = create_access_token(TEST_AUTH, 42, "user", NOW)
    payload = jwt.decode(token, options={"verify_signature": False, "verify_exp": False})
    assert payload["sub"] == "42" and payload["role"] == "user" and payload["type"] == "access"
    assert decode_access_token(TEST_AUTH, create_access_token(TEST_AUTH, 42, "user", datetime.now(timezone.utc))) == 42


def test_expired_access_token():
    old = create_access_token(TEST_AUTH, 1, "user", datetime.now(timezone.utc) - timedelta(hours=2))
    with pytest.raises(InvalidToken, match="expired"):
        decode_access_token(TEST_AUTH, old)


def test_token_signed_with_another_secret_is_rejected():
    other = replace(TEST_AUTH, jwt_secret="another-secret-" + "y" * 40)
    with pytest.raises(InvalidToken, match="invalid"):
        decode_access_token(TEST_AUTH, create_access_token(other, 1, "user", datetime.now(timezone.utc)))


@pytest.mark.parametrize("payload", [
    {"sub": "1", "type": "refresh"},
    {"sub": "abc", "type": "access"},
    {"type": "access"},
])
def test_tokens_with_wrong_contents_are_rejected(payload):
    now = datetime.now(timezone.utc)
    token = jwt.encode({**payload, "iat": now, "exp": now + timedelta(minutes=5)}, TEST_AUTH.jwt_secret, "HS256")
    with pytest.raises(InvalidToken):
        decode_access_token(TEST_AUTH, token)


def test_garbage_and_unsigned_tokens_are_rejected():
    for token in ["not.a.token", "", jwt.encode({"sub": "1", "type": "access"}, None, algorithm="none")]:
        with pytest.raises(InvalidToken):
            decode_access_token(TEST_AUTH, token)


def test_codes_and_refresh_tokens():
    codes = {new_code() for _ in range(200)}
    assert all(len(c) == 6 and c.isdigit() for c in codes) and len(codes) > 150
    assert new_refresh_token() != new_refresh_token()
    assert len(hash_token("abc")) == 64


def test_code_hash_is_tied_to_user_and_purpose():
    base = hash_code(TEST_AUTH, 1, "verify", "123456")
    assert base == hash_code(TEST_AUTH, 1, "verify", "123456")
    assert base != hash_code(TEST_AUTH, 2, "verify", "123456")
    assert base != hash_code(TEST_AUTH, 1, "reset", "123456")


def test_code_email_contents():
    email = code_email("verify", "482913", "Ramesh Karki", 15)
    assert email.subject == "482913 is your Sarathi verification code"
    assert email.preheader == "Your code is 482913. It expires in 15 minutes."
    for version in (email.text, email.html):
        assert "482913" in version and "verify your email address" in version and "15 minutes" in version
        assert "Hi Ramesh," in version  # first name only
    assert f"cid:{LOGO_CID}" in email.html and email.preheader in email.html
    reset = code_email("reset", "111111", "Sita", 15)
    assert "password reset code" in reset.subject and "your password stays the same" in reset.text


def test_code_email_escapes_names():
    email = code_email("verify", "482913", "<b>Mallory</b> Smith", 15)
    assert "<b>Mallory</b>" not in email.html and "&lt;b&gt;Mallory&lt;/b&gt;" in email.html


def test_message_has_text_html_and_the_inline_logo():
    email = code_email("verify", "482913", "Ramesh", 15)
    message = build_message("Sarathi <sarathi.maps@gmail.com>", "ramesh.k@example.com", email)
    assert message["Message-ID"].endswith("@gmail.com>") and message["Date"]
    assert message.get_content_type() == "multipart/alternative"
    text, html = message.get_payload()
    assert text.get_content_type() == "text/plain" and "482913" in text.get_content()
    assert html.get_content_type() == "multipart/related"
    page, logo = html.get_payload()
    assert page.get_content_type() == "text/html" and "482913" in page.get_content()
    assert logo.get_content_type() == "image/png" and logo["Content-ID"] == f"<{LOGO_CID}>"


def test_plain_text_only_messages():
    message = build_message("a@example.com", "b@example.com", Email(subject="Hi", text="Hello"))
    assert message.get_content_type() == "text/plain" and message.get_content().strip() == "Hello"


def test_role_and_verification_checks():
    citizen = User(id=1, email="a@b.c", full_name="A", password_hash="x", role="user", email_verified=False)
    with pytest.raises(HTTPException) as exc:
        verified_user(citizen)
    assert exc.value.status_code == 403
    with pytest.raises(HTTPException):
        moderator(citizen)
    mod = User(id=2, email="m@b.c", full_name="M", password_hash="x", role="moderator", email_verified=True)
    assert moderator(mod) is mod and verified_user(mod) is mod


class FakeSmtp:
    """Records how the SMTP sender used the connection."""
    calls: list = []

    def __init__(self, host, port, timeout):
        FakeSmtp.calls.append(("connect", type(self).__name__, host, port))

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        FakeSmtp.calls.append(("starttls",))

    def login(self, user, password):
        FakeSmtp.calls.append(("login", user))

    def send_message(self, message):
        FakeSmtp.calls.append(("send", message["To"], message["Subject"]))


class FakeSmtpSsl(FakeSmtp):
    pass


@pytest.mark.parametrize("port, expected", [
    (587, [("connect", "FakeSmtp", "smtp.example.com", 587), ("starttls",), ("login", "me@example.com")]),
    (465, [("connect", "FakeSmtpSsl", "smtp.example.com", 465), ("login", "me@example.com")]),
])
def test_smtp_uses_starttls_or_ssl_by_port(monkeypatch, port, expected):
    monkeypatch.setattr(smtplib, "SMTP", FakeSmtp)
    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSmtpSsl)
    FakeSmtp.calls = []
    settings = AuthSettings(jwt_secret="x" * 40, email_backend="smtp", smtp_host="smtp.example.com", smtp_port=port,
                            smtp_user="me@example.com", smtp_password="secret")
    SmtpEmail(settings).send("ramesh.k@example.com", Email(subject="Your code", text="123456"))
    assert FakeSmtp.calls == expected + [("send", "ramesh.k@example.com", "Your code")]
