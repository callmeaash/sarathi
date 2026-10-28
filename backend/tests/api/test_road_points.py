import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.auth.email import MemoryEmail
from app.main import create_app
from app.routing.graph import haversine_m
from app.state import active_closures, apply_closure, lift_closure
from tests.conftest import TEST_AUTH, needs_db
from tests.seed import seed_graph

pytestmark = needs_db

#  D ------------ C      A -> B is one-way (east), so a route from the middle of A-B back to A has to go
#  |              |      round: B, E, C, D, A. Everything else is two-way.
#  |              E
#  A -----→------ B
NODES = {"A": (85.3000, 27.7000), "B": (85.3020, 27.7000), "E": (85.3020, 27.7010), "C": (85.3020, 27.7020),
         "D": (85.3000, 27.7030)}
IDS = {name: i + 1 for i, name in enumerate(NODES)}
ROADS = [("A", "B", "Kalimati Marg", "oneway"), ("B", "E", "Teku Road"), ("E", "C", "Teku Road"),
         ("A", "D", "Dhalko Marg"), ("D", "C", "Bagmati Path")]
AB = haversine_m(*NODES["A"], *NODES["B"])


@pytest.fixture(scope="module")
def client(db_engine):
    seed_graph(db_engine, {IDS[n]: xy for n, xy in NODES.items()},
               [(IDS[a], IDS[b], *rest) for a, b, *rest in ROADS])
    with TestClient(create_app(engine=db_engine, auth_settings=TEST_AUTH, sender=MemoryEmail())) as c:
        c.db = db_engine
        yield c


def route(client, start, end):
    (ax, ay), (bx, by) = start, end
    return client.get("/api/route", params={"from_lon": ax, "from_lat": ay, "to_lon": bx, "to_lat": by})


def on_ab(share):
    """A point a share of the way along A-B."""
    return (85.3000 + 0.002 * share, 27.7000)


def test_starts_and_ends_exactly_at_the_chosen_spots(client):
    body = route(client, on_ab(0.25), NODES["C"]).json()
    coords = body["geometry"]["coordinates"]
    assert coords[0] == pytest.approx(list(on_ab(0.25)), abs=1e-9)  # not back at junction A
    assert coords[-1] == pytest.approx(list(NODES["C"]), abs=1e-9)
    expected = 0.75 * AB + haversine_m(*NODES["B"], *NODES["E"]) + haversine_m(*NODES["E"], *NODES["C"])
    assert body["distance_m"] == pytest.approx(expected, rel=1e-3)
    assert [(s["road_name"], round(s["distance_m"])) for s in body["steps"]] == [
        ("Kalimati Marg", round(0.75 * AB)), ("Teku Road", round(expected - 0.75 * AB))]


def test_a_point_beside_the_road_starts_on_the_road(client):
    body = route(client, (85.3005, 27.7003), NODES["C"]).json()  # about 33 m north of A-B
    assert body["start"]["distance_m"] == pytest.approx(33, abs=2)
    assert body["geometry"]["coordinates"][0] == pytest.approx([85.3005, 27.7000], abs=1e-7)


def test_one_way_streets_are_not_driven_backwards(client):
    body = route(client, on_ab(0.5), NODES["A"]).json()
    names = [s["road_name"] for s in body["steps"]]
    assert names == ["Kalimati Marg", "Teku Road", "Bagmati Path", "Dhalko Marg"]  # all the way round
    assert body["distance_m"] > 4 * AB / 2


def test_both_spots_on_one_road_stay_on_it(client):
    body = route(client, on_ab(0.25), on_ab(0.75)).json()
    assert body["distance_m"] == pytest.approx(0.5 * AB, rel=1e-3)
    assert [s["road_name"] for s in body["steps"]] == ["Kalimati Marg"]
    coords = body["geometry"]["coordinates"]
    assert coords[0] == pytest.approx(list(on_ab(0.25)), abs=1e-9)
    assert coords[-1] == pytest.approx(list(on_ab(0.75)), abs=1e-9)


def test_backwards_along_a_one_way_road_goes_round(client):
    body = route(client, on_ab(0.75), on_ab(0.25)).json()
    assert body["distance_m"] > 2 * AB


def test_the_same_spot_is_an_empty_route(client):
    body = route(client, on_ab(0.5), on_ab(0.5)).json()
    assert body["distance_m"] == pytest.approx(0, abs=0.01) and body["steps"] == []
    assert len(body["geometry"]["coordinates"]) == 2


def test_starting_on_a_closed_road_has_no_way_out(client):
    state = client.app.state.routing
    with client.db.begin() as conn:
        incident = conn.execute(text("""
            INSERT INTO incidents (kind, status, geom, reported_geom, road_name, snap_distance_m, closure_radius_m)
            VALUES ('flood', 'verified', ST_SetSRID(ST_MakePoint(85.301, 27.7), 4326),
                    ST_SetSRID(ST_MakePoint(85.301, 27.7), 4326), 'Kalimati Marg', 0, 30) RETURNING id
        """)).scalar_one()
    apply_closure(state, incident, [100])  # A -> B
    try:
        response = route(client, on_ab(0.5), NODES["C"])
        assert response.status_code == 404 and "closed roads cut off" in response.json()["detail"]
        # From junction A itself the open road to D is still usable.
        assert route(client, NODES["A"], NODES["C"]).json()["steps"][0]["road_name"] == "Dhalko Marg"
    finally:
        lift_closure(state, incident)
        assert active_closures(state) == {}
