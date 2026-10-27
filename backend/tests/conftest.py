import os
from pathlib import Path

import pytest
from sqlalchemy import create_engine

from app.config import AuthSettings
from app.routing.graph import build_graph, haversine_m

BACKEND_DIR = Path(__file__).resolve().parent.parent
TEST_AUTH = AuthSettings(jwt_secret="test-secret-" + "x" * 40, access_token_minutes=30, refresh_token_days=30,
                         cookie_secure=False)  # the test client talks plain http
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")
needs_db = pytest.mark.skipif(not TEST_DATABASE_URL, reason="set TEST_DATABASE_URL to run database tests")


@pytest.fixture(scope="session")
def db_engine():
    from alembic import command
    from alembic.config import Config

    os.environ["ALEMBIC_DATABASE_URL"] = TEST_DATABASE_URL
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    engine = create_engine(TEST_DATABASE_URL)
    yield engine
    engine.dispose()


def graph_from(coords: dict[int, tuple[float, float]], roads: list[tuple], stretch: float = 1.0):
    # roads: (source, target, seconds) or (source, target, seconds, length); length defaults to the
    # straight-line distance times stretch, so it is never shorter than the straight line.
    nodes = [(n, lon, lat) for n, (lon, lat) in coords.items()]
    edges = []
    for i, road in enumerate(roads):
        source, target, seconds = road[:3]
        a, b = coords[source], coords[target]
        length = road[3] if len(road) > 3 else haversine_m(*a, *b) * stretch
        edges.append((1000 + i, source, target, length, seconds))
    return build_graph(nodes, edges)
