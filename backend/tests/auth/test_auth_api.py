import re
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app import cli
from app.api.auth import REFRESH_COOKIE
from app.auth.email import MemoryEmail
from app.auth.service import MAX_CODE_ATTEMPTS, MAX_FAILED_LOGINS
from app.auth.tokens import create_access_token
from app.config import AuthSettings
from app.main import create_app
from app.routing.graph import build_graph
from app.routing.nearest import FacilityIndex
from app.state import RoutingState
from tests.conftest import TEST_AUTH, needs_db

pytestmark = needs_db

EMAIL, PASSWORD = "ramesh.k@example.com", "correct horse battery"


@pytest.fixture
def outbox():
    return MemoryEmail()


@pytest.fixture
def client(db_engine, outbox):
    with db_engine.begin() as conn:
        conn.execute(text("TRUNCATE users RESTART IDENTITY CASCADE"))
    routing = RoutingState(build_graph([(1, 85.3, 27.7)], []), FacilityIndex({}, 0))
    with TestClient(create_app(engine=db_engine, routing_state=routing, auth_settings=TEST_AUTH,
                               sender=outbox)) as c:
        c.db = db_engine
        yield c


def sql(client, statement, **params):
    with client.db.begin() as conn:
        return conn.execute(text(statement), params)


def last_code(outbox) -> str:
    return re.search(r"\b(\d{6})\b", outbox.outbox[-1][1]).group(1)


def register(client, email=EMAIL, password=PASSWORD, name="Ramesh Karki"):
    return client.post("/api/auth/register", json={"full_name": name, "email": email, "password": password})


def login(client, email=EMAIL, password=PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def verified_account(client, outbox):
    register(client)
    client.post("/api/auth/verify-email", json={"email": EMAIL, "code": last_code(outbox)})


def session_cookie(response) -> str:
    return response.cookies[REFRESH_COOKIE]


def refresh(client, token=None):
    # Without a token the client's cookie jar is used, as a browser would; with one, that cookie is sent instead.
    headers = {"Cookie": f"{REFRESH_COOKIE}={token}"} if token else {}
    return client.post("/api/auth/refresh", headers=headers)


def logout(client, token=None):
    headers = {"Cookie": f"{REFRESH_COOKIE}={token}"} if token else {}
    return client.post("/api/auth/logout", headers=headers)


def auth(tokens) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


# --- registration and email verification ---

def test_register_creates_an_unverified_account_and_emails_a_code(client, outbox):
    response = register(client, email="  Ramesh.K@Example.com ")
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == EMAIL and body["email_verified"] is False and body["role"] == "user"
    assert "password" not in str(body) and "hash" not in str(body)
    to, subject, _ = outbox.outbox[-1]
    assert to == EMAIL and "verification code" in subject


def test_register_rejects_a_taken_email_in_any_case(client):
    register(client)
    response = register(client, email="RAMESH.K@example.com")
    assert response.status_code == 409


@pytest.mark.parametrize("password, message", [
    ("short", "at least 8"), ("password1", "too common"), ("ramesh.k", "same as your email"),
])
def test_register_rejects_weak_passwords(client, password, message):
    response = register(client, password=password)
    assert response.status_code == 422 and message in response.json()["detail"]


@pytest.mark.parametrize("body", [
    {"full_name": "A", "email": "not-an-email", "password": PASSWORD},
    {"full_name": "", "email": EMAIL, "password": PASSWORD},
    {"email": EMAIL, "password": PASSWORD},
])
def test_register_rejects_bad_input(client, body):
    assert client.post("/api/auth/register", json=body).status_code == 422


def test_register_rejects_a_blank_name(client):
    assert register(client, name="    ").status_code == 422


def test_verify_email_with_the_code_signs_in(client, outbox):
    register(client)
    response = client.post("/api/auth/verify-email", json={"email": EMAIL, "code": last_code(outbox)})
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["email_verified"] is True and REFRESH_COOKIE in response.cookies
    assert client.get("/api/me", headers=auth(body)).json()["email_verified"] is True


def test_verified_accounts_cannot_be_signed_into_with_a_code(client, outbox):
    verified_account(client, outbox)
    again = client.post("/api/auth/verify-email", json={"email": EMAIL, "code": "000000"})
    unknown = client.post("/api/auth/verify-email", json={"email": "nobody@example.com", "code": "000000"})
    assert again.status_code == unknown.status_code == 400
    assert again.json() == unknown.json()  # does not reveal that the account exists


def test_wrong_codes_are_counted_and_then_blocked(client, outbox):
    register(client)
    code = last_code(outbox)
    wrong = "000000" if code != "000000" else "111111"
    first = client.post("/api/auth/verify-email", json={"email": EMAIL, "code": wrong})
    assert first.status_code == 400 and f"{MAX_CODE_ATTEMPTS - 1} attempts left" in first.json()["detail"]
    for _ in range(MAX_CODE_ATTEMPTS - 1):
        client.post("/api/auth/verify-email", json={"email": EMAIL, "code": wrong})
    blocked = client.post("/api/auth/verify-email", json={"email": EMAIL, "code": code})
    assert blocked.status_code == 400 and "ask for a new one" in blocked.json()["detail"]


def test_expired_code_is_rejected(client, outbox):
    register(client)
    sql(client, "UPDATE email_codes SET expires_at = now() - interval '1 minute'")
    response = client.post("/api/auth/verify-email", json={"email": EMAIL, "code": last_code(outbox)})
    assert response.status_code == 400 and "expired" in response.json()["detail"]


@pytest.mark.parametrize("code", ["12345", "1234567", "abcdef", ""])
def test_malformed_codes_are_rejected(client, code):
    register(client)
    assert client.post("/api/auth/verify-email", json={"email": EMAIL, "code": code}).status_code == 422


def test_unknown_email_cannot_be_verified(client):
    response = client.post("/api/auth/verify-email", json={"email": "nobody@example.com", "code": "123456"})
    assert response.status_code == 400


# --- resending codes ---

def test_resend_respects_the_cooldown_and_replaces_the_old_code(client, outbox):
    register(client)
    old = last_code(outbox)
    assert client.post("/api/auth/resend-code", json={"email": EMAIL}).status_code == 202
    assert len(outbox.outbox) == 1  # within 60 s: nothing new sent
    sql(client, "UPDATE email_codes SET created_at = created_at - interval '61 seconds'")
    client.post("/api/auth/resend-code", json={"email": EMAIL})
    assert len(outbox.outbox) == 2
    new = last_code(outbox)
    if new != old:
        assert client.post("/api/auth/verify-email", json={"email": EMAIL, "code": old}).status_code == 400
    assert client.post("/api/auth/verify-email", json={"email": EMAIL, "code": new}).status_code == 200


def test_resend_is_capped_per_hour(client, outbox):
    register(client)
    for _ in range(10):
        sql(client, "UPDATE email_codes SET created_at = created_at - interval '61 seconds'")
        client.post("/api/auth/resend-code", json={"email": EMAIL})
    assert len(outbox.outbox) == 5  # at most 5 codes within an hour


def test_resend_reveals_nothing_about_unknown_or_verified_accounts(client, outbox):
    unknown = client.post("/api/auth/resend-code", json={"email": "nobody@example.com"})
    verified_account(client, outbox)
    sent = len(outbox.outbox)
    known = client.post("/api/auth/resend-code", json={"email": EMAIL})
    assert unknown.status_code == known.status_code == 202 and unknown.json() == known.json()
    assert len(outbox.outbox) == sent


# --- signing in ---

def test_login_and_me(client, outbox):
    register(client)
    tokens = login(client).json()
    assert tokens["token_type"] == "bearer" and tokens["expires_in"] == 30 * 60
    assert "refresh_token" not in tokens  # only in the httpOnly cookie
    me = client.get("/api/me", headers=auth(tokens)).json()
    assert me["email"] == EMAIL and me["email_verified"] is False  # unverified users can still browse


def test_login_failures_look_the_same(client):
    register(client)
    wrong_password = login(client, password="wrong password!")
    unknown_email = login(client, email="nobody@example.com")
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


def test_account_locks_after_repeated_failures(client):
    register(client)
    for _ in range(MAX_FAILED_LOGINS):
        login(client, password="wrong password!")
    locked = login(client)
    assert locked.status_code == 429 and int(locked.headers["Retry-After"]) > 0
    sql(client, "UPDATE users SET locked_until = now() - interval '1 second'")
    assert login(client).status_code == 200


def test_successful_login_resets_the_failure_count(client):
    register(client)
    for _ in range(MAX_FAILED_LOGINS - 1):
        login(client, password="wrong password!")
    assert login(client).status_code == 200
    login(client, password="wrong password!")
    assert login(client).status_code == 200


def test_suspended_accounts_are_shut_out(client):
    register(client)
    tokens = login(client).json()
    sql(client, "UPDATE users SET status = 'suspended'")
    assert login(client).status_code == 403
    assert client.get("/api/me", headers=auth(tokens)).status_code == 403
    assert refresh(client).status_code == 403


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer nonsense"}, {"Authorization": "Basic abc"}])
def test_me_needs_a_valid_token(client, headers):
    assert client.get("/api/me", headers=headers).status_code in (401, 403)


def test_expired_access_token(client):
    register(client)
    user_id = login(client).json()["user"]["id"]
    old = create_access_token(TEST_AUTH, user_id, "user", datetime.now(timezone.utc) - timedelta(hours=1))
    response = client.get("/api/me", headers={"Authorization": f"Bearer {old}"})
    assert response.status_code == 401 and "expired" in response.json()["detail"]


def test_token_for_a_deleted_account(client):
    register(client)
    tokens = login(client).json()
    sql(client, "DELETE FROM users")
    assert client.get("/api/me", headers=auth(tokens)).status_code == 401


# --- refresh tokens and sign-out ---

def test_session_cookie_is_out_of_reach_of_scripts(client):
    register(client)
    cookie = login(client).headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=strict" in cookie and "Path=/api/auth" in cookie
    assert f"Max-Age={30 * 86400}" in cookie and "Secure" not in cookie  # tests run over plain http


def test_session_cookie_is_https_only_by_default(db_engine):
    with db_engine.begin() as conn:
        conn.execute(text("TRUNCATE users RESTART IDENTITY CASCADE"))
    routing = RoutingState(build_graph([(1, 85.3, 27.7)], []), FacilityIndex({}, 0))
    settings = AuthSettings(jwt_secret=TEST_AUTH.jwt_secret)
    app = create_app(engine=db_engine, routing_state=routing, auth_settings=settings, sender=MemoryEmail())
    with TestClient(app, base_url="https://testserver") as secure_client:
        register(secure_client)
        assert "Secure" in login(secure_client).headers["set-cookie"]


def test_refresh_rotates_the_token(client):
    register(client)
    first = session_cookie(login(client))
    response = refresh(client)
    assert response.status_code == 200 and session_cookie(response) != first
    assert client.get("/api/me", headers=auth(response.json())).status_code == 200


def test_refresh_needs_the_cookie(client):
    response = client.post("/api/auth/refresh")
    assert response.status_code == 401 and response.json()["detail"] == "not signed in"


def test_two_tabs_refreshing_at_once_is_not_treated_as_theft(client):
    register(client)
    first = session_cookie(login(client))
    second = session_cookie(refresh(client))
    late = refresh(client, first)  # the other tab, a moment later, still with the old cookie
    assert late.status_code == 409
    assert refresh(client, second).status_code == 200


def test_reusing_an_old_refresh_token_ends_every_session(client):
    register(client)
    first = session_cookie(login(client))
    second = session_cookie(refresh(client))
    sql(client, "UPDATE refresh_tokens SET revoked_at = now() - interval '1 minute' WHERE revoke_reason = 'rotated'")
    assert refresh(client, first).status_code == 401
    assert refresh(client, second).status_code == 401


def test_expired_and_unknown_refresh_tokens(client):
    register(client)
    login(client)
    sql(client, "UPDATE refresh_tokens SET expires_at = now() - interval '1 second'")
    assert refresh(client).status_code == 401
    assert refresh(client, "made-up").status_code == 401


def test_logout_ends_only_that_session_and_removes_the_cookie(client):
    register(client)
    phone, laptop = session_cookie(login(client)), session_cookie(login(client))
    response = logout(client, phone)
    assert response.status_code == 204 and "Max-Age=0" in response.headers["set-cookie"]
    assert refresh(client, phone).status_code == 401
    assert refresh(client, laptop).status_code == 200
    assert logout(client, "made-up").status_code == 204
    client.cookies.clear()
    assert client.post("/api/auth/logout").status_code == 204


# --- password reset ---

def test_forgot_and_reset_password(client, outbox):
    register(client)
    old_session = session_cookie(login(client))
    assert client.post("/api/auth/forgot-password", json={"email": EMAIL}).status_code == 202
    assert "password reset code" in outbox.outbox[-1][1]
    response = client.post("/api/auth/reset-password", json={
        "email": EMAIL, "code": last_code(outbox), "new_password": "a brand new passphrase"})
    assert response.status_code == 200
    assert login(client).status_code == 401
    assert login(client, password="a brand new passphrase").json()["user"]["email_verified"] is True
    assert refresh(client, old_session).status_code == 401


def test_reset_with_a_weak_password_keeps_the_code_usable(client, outbox):
    register(client)
    client.post("/api/auth/forgot-password", json={"email": EMAIL})
    code = last_code(outbox)
    weak = client.post("/api/auth/reset-password", json={"email": EMAIL, "code": code, "new_password": "short"})
    assert weak.status_code == 422
    ok = client.post("/api/auth/reset-password", json={"email": EMAIL, "code": code,
                                                       "new_password": "a brand new passphrase"})
    assert ok.status_code == 200


def test_reset_needs_the_right_code(client, outbox):
    register(client)
    client.post("/api/auth/forgot-password", json={"email": EMAIL})
    code = last_code(outbox)
    wrong = "000000" if code != "000000" else "111111"
    response = client.post("/api/auth/reset-password", json={"email": EMAIL, "code": wrong,
                                                             "new_password": "a brand new passphrase"})
    assert response.status_code == 400 and login(client).status_code == 200


def test_reset_unlocks_a_locked_account(client, outbox):
    register(client)
    for _ in range(MAX_FAILED_LOGINS):
        login(client, password="wrong password!")
    client.post("/api/auth/forgot-password", json={"email": EMAIL})
    client.post("/api/auth/reset-password", json={"email": EMAIL, "code": last_code(outbox),
                                                  "new_password": "a brand new passphrase"})
    assert login(client, password="a brand new passphrase").status_code == 200


def test_forgot_password_reveals_nothing(client, outbox):
    response = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert response.status_code == 202 and outbox.outbox == []


def test_verify_and_reset_codes_are_separate(client, outbox):
    register(client)
    verify_code = last_code(outbox)
    response = client.post("/api/auth/reset-password", json={"email": EMAIL, "code": verify_code,
                                                             "new_password": "a brand new passphrase"})
    assert response.status_code == 400


# --- making a moderator ---

def test_cli_sets_a_role(client, monkeypatch, capsys):
    register(client)
    monkeypatch.setattr(cli, "get_engine", lambda: client.db)
    assert cli.main(["set-role", EMAIL, "moderator"]) == 0
    assert "is now a moderator" in capsys.readouterr().out
    assert login(client).json()["user"]["role"] == "moderator"
    assert cli.main(["set-role", "nobody@example.com", "moderator"]) == 1
