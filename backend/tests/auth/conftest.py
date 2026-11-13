import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.auth.email import MemoryEmail
from app.main import create_app
from app.routing.graph import build_graph
from app.routing.nearest import FacilityIndex
from app.state import RoutingState
from tests.conftest import TEST_AUTH


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
