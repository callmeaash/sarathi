import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.auth.email import MemoryEmail
from app.main import create_app
from app.state import apply_closure, lift_closure
from tests.conftest import TEST_AUTH, needs_db
from tests.seed import seed_graph

pytestmark = needs_db

#  D ------------ C      Two ways from A to C: east through B and E (shorter) or north through D (longer).
#  |              |      Unverified reports don't close roads, but the route lists them and can be asked
#  |              E      to keep clear of them.
#  A ------------ B
NODES = {"A": (85.3000, 27.7000), "B": (85.3020, 27.7000), "E": (85.3020, 27.7010), "C": (85.3020, 27.7020),
         "D": (85.3000, 27.7030)}
IDS = {name: i + 1 for i, name in enumerate(NODES)}
ROADS = [("A", "B", "Kalimati Marg"), ("B", "E", "Teku Road"), ("E", "C", "Teku Road"), ("A", "D", "Dhalko Marg"),
         ("D", "C", "Bagmati Path")]


@pytest.fixture(scope="module")
def client(db_engine):
    seed_graph(db_engine, {IDS[n]: xy for n, xy in NODES.items()}, [(IDS[a], IDS[b], name) for a, b, name in ROADS])
    with TestClient(create_app(engine=db_engine, auth_settings=TEST_AUTH, sender=MemoryEmail())) as c:
        c.db = db_engine
        yield c


@pytest.fixture
def report(client):
    """Add an incident at a point: report(lon, lat, status='pending') -> id; removed afterwards."""
    made = []

    def add(lon, lat, status="pending", kind="road_works", road="Kalimati Marg"):
        with client.db.begin() as conn:
            incident_id = conn.execute(text("""
                INSERT INTO incidents (kind, status, geom, reported_geom, road_name, snap_distance_m, closure_radius_m)
                VALUES (:kind, :status, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
                        ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), :road, 0, :radius) RETURNING id
            """), {"kind": kind, "status": status, "lon": lon, "lat": lat, "road": road,
                   "radius": 30 if status == "verified" else None}).scalar_one()
        made.append(incident_id)
        return incident_id

    yield add
    with client.db.begin() as conn:
        conn.execute(text("DELETE FROM incidents WHERE id = ANY(:ids)"), {"ids": made})


def route(client, **params):
    (ax, ay), (bx, by) = NODES["A"], NODES["C"]
    return client.get("/api/route", params={"from_lon": ax, "from_lat": ay, "to_lon": bx, "to_lat": by, **params})


def roads(body):
    return [step["road_name"] for step in body["steps"]]


def test_lists_unverified_reports_on_the_route_without_changing_it(client, report):
    incident_id = report(85.3010, 27.7000)  # middle of A-B
    body = route(client).json()
    assert roads(body) == ["Kalimati Marg", "Teku Road"]  # still the shortest way; pending reports close nothing
    (listed,) = body["unverified"]
    assert listed["incident_id"] == incident_id and listed["kind"] == "road_works"
    assert listed["road_name"] == "Kalimati Marg" and listed["created_at"]
    assert (listed["lon"], listed["lat"]) == pytest.approx((85.3010, 27.7000))
    assert body["avoids_unverified"] is False


def test_can_keep_clear_of_unverified_reports(client, report):
    report(85.3010, 27.7000)
    body = route(client, avoid_unverified=True).json()
    assert roads(body) == ["Dhalko Marg", "Bagmati Path"]
    assert body["unverified"] == [] and body["avoids_unverified"] is True
    assert body["detour"] is None  # a detour is only for verified closures


def test_reports_off_the_route_are_not_listed(client, report):
    report(85.3010, 27.7030, road="Bagmati Path")  # on D-C, which the route doesn't use
    assert route(client).json()["unverified"] == []


def test_only_pending_reports_count(client, report):
    report(85.3010, 27.7000, status="rejected")
    report(85.3010, 27.7000, status="cleared")
    assert route(client).json()["unverified"] == []


def test_says_when_no_route_avoids_them(client, report):
    report(85.3010, 27.7000)
    report(85.3000, 27.7015, road="Dhalko Marg")  # both ways out of A
    response = route(client, avoid_unverified=True)
    assert response.status_code == 404
    assert response.json()["detail"] == "no route avoids the unverified reports between these points"
    assert len(route(client).json()["unverified"]) == 1  # the normal route still works and lists what it passes


def test_going_around_unverified_reports_is_not_called_a_closure_detour(client, report):
    report(85.3010, 27.7000)  # unverified, on A-B
    state = client.app.state.routing
    closed = report(85.3020, 27.7030, status="verified", road="Elsewhere")
    apply_closure(state, closed, [])  # an active closure that touches neither route
    try:
        body = route(client, avoid_unverified=True).json()
        assert roads(body) == ["Dhalko Marg", "Bagmati Path"] and body["detour"] is None
    finally:
        lift_closure(state, closed)
