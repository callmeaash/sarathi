import pytest

from app.auth.service import MAX_FAILED_LOGINS
from tests.auth.test_auth_api import EMAIL, PASSWORD, auth, login, refresh, register, session_cookie, sql
from tests.conftest import needs_db

pytestmark = needs_db

NEW_PASSWORD = "a brand new passphrase"


def signed_in(client) -> dict:
    register(client)
    return auth(login(client).json())


def change_password(client, headers, current=PASSWORD, new=NEW_PASSWORD):
    return client.post("/api/auth/change-password", headers=headers,
                       json={"current_password": current, "new_password": new})


def add_report(client, status, email=EMAIL):
    sql(client, """
        INSERT INTO incidents (reporter_id, kind, status, geom, reported_geom, snap_distance_m, closure_radius_m)
        SELECT id, 'flood', :status, ST_SetSRID(ST_MakePoint(85.3, 27.7), 4326),
               ST_SetSRID(ST_MakePoint(85.3, 27.7), 4326), 0, 30 FROM users WHERE email = :email
    """, status=status, email=email)


# --- profile ---

def test_name_can_be_changed_and_is_tidied(client):
    headers = signed_in(client)
    response = client.patch("/api/me", json={"full_name": "  Ramesh   Bahadur Karki "}, headers=headers)
    assert response.status_code == 200 and response.json()["full_name"] == "Ramesh Bahadur Karki"
    assert client.get("/api/me", headers=headers).json()["full_name"] == "Ramesh Bahadur Karki"
    assert response.json()["email"] == EMAIL  # nothing else changes


@pytest.mark.parametrize("body", [{"full_name": ""}, {"full_name": "   "}, {"full_name": "x" * 101}, {}])
def test_bad_names_are_rejected(client, body):
    assert client.patch("/api/me", json=body, headers=signed_in(client)).status_code == 422


def test_profile_changes_need_an_account(client):
    assert client.patch("/api/me", json={"full_name": "Someone"}).status_code == 401
    assert client.get("/api/me/summary").status_code == 401


def test_summary_counts_the_users_own_reports(client):
    headers = signed_in(client)
    assert client.get("/api/me/summary", headers=headers).json() == {"reports": 0, "pending": 0, "verified": 0}
    register(client, email="other@example.com")
    for status in ("pending", "pending", "verified", "cleared", "rejected", "merged"):
        add_report(client, status)
    add_report(client, "verified", email="other@example.com")
    assert client.get("/api/me/summary", headers=headers).json() == {"reports": 6, "pending": 2, "verified": 2}


# --- changing the password ---

def test_password_change_keeps_this_device_and_signs_out_the_others(client):
    register(client)
    phone = session_cookie(login(client))
    laptop_session = login(client)  # the client's cookie jar now holds the laptop's session
    response = change_password(client, auth(laptop_session.json()))
    assert response.status_code == 204
    assert refresh(client, phone).status_code == 401
    assert refresh(client).status_code == 200
    assert login(client).status_code == 401
    assert login(client, password=NEW_PASSWORD).status_code == 200


def test_password_change_needs_the_current_password(client):
    headers = signed_in(client)
    response = change_password(client, headers, current="not my password")
    assert response.status_code == 422 and "current password is incorrect" in response.json()["detail"]
    assert login(client).status_code == 200


@pytest.mark.parametrize("new, message", [
    ("short", "at least 8"), ("password1", "too common"), (PASSWORD, "must be different"), ("ramesh.k", "email name"),
])
def test_password_change_rejects_weak_or_unchanged_passwords(client, new, message):
    response = change_password(client, signed_in(client), new=new)
    assert response.status_code == 422 and message in response.json()["detail"]
    assert login(client).status_code == 200


def test_wrong_current_passwords_lock_the_account(client):
    headers = signed_in(client)
    for _ in range(MAX_FAILED_LOGINS):
        assert change_password(client, headers, current="not my password").status_code == 422
    response = change_password(client, headers)
    assert response.status_code == 429 and int(response.headers["retry-after"]) > 0
    assert login(client).status_code == 429


def test_password_change_needs_an_account(client):
    assert change_password(client, {}).status_code == 401


# --- signing out everywhere ---

def test_logout_all_ends_every_session(client):
    register(client)
    phone = session_cookie(login(client))
    laptop_session = login(client)
    response = client.post("/api/auth/logout-all", headers=auth(laptop_session.json()))
    assert response.status_code == 204 and "Max-Age=0" in response.headers["set-cookie"]
    assert refresh(client, phone).status_code == 401
    assert refresh(client, session_cookie(laptop_session)).status_code == 401
    assert login(client).status_code == 200  # the account itself is fine
    client.cookies.clear()
    assert client.post("/api/auth/logout-all").status_code == 401


# --- deleting the account ---

def test_deleting_the_account_removes_it_but_keeps_its_reports(client):
    headers = signed_in(client)
    session = session_cookie(login(client))
    add_report(client, "verified")
    response = client.post("/api/me/delete", json={"password": PASSWORD}, headers=headers)
    assert response.status_code == 204 and "Max-Age=0" in response.headers["set-cookie"]

    assert client.get("/api/me", headers=headers).status_code == 401
    assert refresh(client, session).status_code == 401
    assert login(client).status_code == 401
    assert sql(client, "SELECT count(*) FROM users").scalar() == 0
    assert sql(client, "SELECT reporter_id FROM incidents").all() == [(None,)]
    assert register(client).status_code == 201  # the email is free again


def test_deleting_needs_the_right_password(client):
    headers = signed_in(client)
    response = client.post("/api/me/delete", json={"password": "not my password"}, headers=headers)
    assert response.status_code == 422 and "current password is incorrect" in response.json()["detail"]
    assert client.post("/api/me/delete", json={}, headers=headers).status_code == 422
    assert client.post("/api/me/delete", json={"password": PASSWORD}).status_code == 401
    assert client.get("/api/me", headers=headers).status_code == 200
