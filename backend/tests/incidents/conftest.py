from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.auth.email import MemoryEmail
from app.auth.tokens import create_access_token
from app.main import create_app
from app.state import active_closures, lift_closure
from tests.conftest import TEST_AUTH
from tests.seed import seed_network

WEST_ROAD = "Kalimati Marg"           # road 0-4, stored as edges 16 and 17
USERS = {  # key: (full name, role, email verified)
    "asha": ("Asha Gurung", "user", True),
    "bikash": ("Bikash Thapa", "user", True),
    "chandra": ("Chandra Rai", "user", False),
    "mod": ("Maya Shrestha", "moderator", True),
}


@pytest.fixture(scope="module")
def app_client(db_engine):
    seed_network(db_engine, road_names={(0, 4): WEST_ROAD})
    ids = {}
    with db_engine.begin() as conn:
        conn.execute(text("TRUNCATE users RESTART IDENTITY CASCADE"))
        for key, (name, role, verified) in USERS.items():
            ids[key] = conn.execute(text("""
                INSERT INTO users (email, full_name, password_hash, role, email_verified)
                VALUES (:email, :name, 'not-a-real-hash', :role, :verified) RETURNING id
            """), {"email": f"{key}@example.com", "name": name, "role": role, "verified": verified}).scalar_one()
    now = datetime.now(timezone.utc)
    with TestClient(create_app(engine=db_engine, auth_settings=TEST_AUTH, sender=MemoryEmail())) as c:
        c.db = db_engine
        c.user_ids = ids
        c.tokens = {key: create_access_token(TEST_AUTH, ids[key], USERS[key][1], now) for key in USERS}
        yield c


@pytest.fixture
def client(app_client):
    yield app_client
    state = app_client.app.state.routing
    for incident_id in active_closures(state):
        lift_closure(state, incident_id)
    with app_client.db.begin() as conn:
        conn.execute(text("TRUNCATE incidents, audit_log RESTART IDENTITY CASCADE"))
        conn.execute(text("UPDATE users SET status = 'active', role = :role WHERE id = :id"),
                     [{"id": app_client.user_ids[key], "role": USERS[key][1]} for key in USERS])
