import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.auth.email import MemoryEmail
from app.main import create_app
from app.state import active_closures, apply_closure, lift_closure
from tests.conftest import TEST_AUTH, needs_db
from tests.seed import seed_graph

pytestmark = needs_db

#  D ------------ C      Two ways from A to C: east then north through B and E (shorter),
#  |              |      or north then east through D (longer).
#  |              E      B-E and E-C are both Teku Road, so they make one step.
#  A ------------ B
NODES = {"A": (85.3000, 27.7000), "B": (85.3020, 27.7000), "E": (85.3020, 27.7010), "C": (85.3020, 27.7020),
         "D": (85.3000, 27.7030)}
IDS = {name: i + 1 for i, name in enumerate(NODES)}
ROADS = [("A", "B", "Kalimati Marg"), ("B", "E", "Teku Road"), ("E", "C", "Teku Road"), ("A", "D", "Dhalko Marg"),
         ("D", "C", None)]
EDGES = {(a, b): (100 + 2 * i, 101 + 2 * i) for i, (a, b, _) in enumerate(ROADS)}  # both directions


@pytest.fixture(scope="module")
def client(db_engine):
    seed_graph(db_engine, {IDS[n]: xy for n, xy in NODES.items()}, [(IDS[a], IDS[b], name) for a, b, name in ROADS])
    with TestClient(create_app(engine=db_engine, auth_settings=TEST_AUTH, sender=MemoryEmail())) as c:
        c.db = db_engine
        yield c


@pytest.fixture
def close(client):
    """Close a road for a verified hazard: close(("A", "B"), kind) -> incident id."""
    state = client.app.state.routing
    made = []

    def closer(road, kind="flood", name="Kalimati Marg"):
        with client.db.begin() as conn:
            lon, lat = NODES[road[0]]
            incident_id = conn.execute(text("""
                INSERT INTO incidents (kind, status, geom, reported_geom, road_name, snap_distance_m, closure_radius_m)
                VALUES (:kind, 'verified', ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
                        ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), :name, 0, 30) RETURNING id
            """), {"kind": kind, "lon": lon, "lat": lat, "name": name}).scalar_one()
        apply_closure(state, incident_id, list(EDGES[road]))
        made.append(incident_id)
        return incident_id

    yield closer
    for incident_id in made:
        lift_closure(state, incident_id)
    assert active_closures(state) == {}


def route(client, a, b, **params):
    (ax, ay), (bx, by) = NODES[a], NODES[b]
    return client.get("/api/route", params={"from_lon": ax, "from_lat": ay, "to_lon": bx, "to_lat": by, **params})


def test_steps_follow_the_roads_in_order_and_merge_segments_of_one_road(client):
    body = route(client, "A", "C").json()
    assert [step["road_name"] for step in body["steps"]] == ["Kalimati Marg", "Teku Road"]
    assert sum(step["distance_m"] for step in body["steps"]) == pytest.approx(body["distance_m"])
    assert sum(step["duration_s"] for step in body["steps"]) == pytest.approx(body["duration_s"])
    assert body["detour"] is None  # nothing closed


def test_unnamed_roads_have_no_name(client, close):
    close(("A", "B"))
    body = route(client, "A", "C").json()
    assert [step["road_name"] for step in body["steps"]] == ["Dhalko Marg", None]


def test_a_detour_names_the_closures_it_goes_around(client, close):
    usual = route(client, "A", "C").json()
    incident_id = close(("A", "B"), kind="flood", name="Kalimati Marg")
    body = route(client, "A", "C").json()
    assert body["distance_m"] > usual["distance_m"]
    assert body["detour"] == {
        "usual_distance_m": pytest.approx(usual["distance_m"]),
        "usual_duration_s": pytest.approx(usual["duration_s"]),
        "closures": [{"incident_id": incident_id, "kind": "flood", "road_name": "Kalimati Marg"}],
    }


def test_closures_off_the_route_are_not_a_detour(client, close):
    close(("D", "C"), name="Bagmati Path")
    body = route(client, "A", "C").json()
    assert body["detour"] is None and [s["road_name"] for s in body["steps"]] == ["Kalimati Marg", "Teku Road"]


@pytest.mark.parametrize("weight, algorithm", [("length", "dijkstra"), ("time", "astar")])
def test_detours_use_the_same_weight_and_algorithm(client, close, weight, algorithm):
    close(("A", "B"))
    body = route(client, "A", "C", weight=weight, algorithm=algorithm).json()
    assert body["weight"] == weight and body["algorithm"] == algorithm and body["detour"] is not None


def test_says_when_closures_cut_off_every_route(client, close):
    close(("A", "B"))
    close(("A", "D"), name="Dhalko Marg")
    response = route(client, "A", "C")
    assert response.status_code == 404
    assert response.json()["detail"] == "closed roads cut off every route between these points"


def test_a_route_to_the_same_place_has_no_steps(client):
    body = route(client, "B", "B").json()
    assert body["steps"] == [] and body["detour"] is None
