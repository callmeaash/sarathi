import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.routing.graph import haversine_m
from app.auth.email import MemoryEmail
from tests.conftest import TEST_AUTH, needs_db
from tests.seed import NODES, SPEED_MPS, route, seed_network

pytestmark = needs_db


@pytest.fixture(scope="module")
def client(db_engine):
    seed_network(db_engine)
    with TestClient(create_app(engine=db_engine, auth_settings=TEST_AUTH, sender=MemoryEmail())) as c:
        yield c


@pytest.fixture
def graph(client):
    graph = client.app.state.routing.graph
    yield graph
    for edge_id in graph.closed_edge_ids():  # undo any closures a test made
        while graph.is_closed(edge_id):
            graph.open_edges([edge_id], both_directions=False)


def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok" and body["nodes"] == 5 and body["edges"] == 8


def test_route_follows_the_roads(client):
    body = route(client, 0, 3).json()
    coords = body["geometry"]["coordinates"]
    assert coords[0] == list(NODES[0]) and coords[-1] == list(NODES[3])
    assert coords == [list(NODES[0]), list(NODES[2]), list(NODES[3])]
    expected = haversine_m(*NODES[0], *NODES[2]) + haversine_m(*NODES[2], *NODES[3])
    assert body["distance_m"] == pytest.approx(expected)
    assert body["duration_s"] == pytest.approx(expected / SPEED_MPS)
    assert body["start"]["node_id"] == 0 and body["end"]["node_id"] == 3


def test_route_geometry_is_flipped_for_reverse_edges(client):
    coords = route(client, 1, 0).json()["geometry"]["coordinates"]
    assert coords == [list(NODES[1]), list(NODES[3]), list(NODES[2]), list(NODES[0])]


def test_route_to_the_same_place(client):
    body = route(client, 2, 2).json()
    assert body["distance_m"] == 0 and body["edge_ids"] == []
    assert body["geometry"]["coordinates"] == [list(NODES[2])] * 2


@pytest.mark.parametrize("algorithm", ["dijkstra", "astar"])
@pytest.mark.parametrize("weight", ["length", "time"])
def test_route_options(client, weight, algorithm):
    body = route(client, 4, 1, weight=weight, algorithm=algorithm).json()
    assert body["weight"] == weight and body["algorithm"] == algorithm and body["visited_nodes"] >= 1


@pytest.mark.parametrize("params", [{"weight": "cheapest"}, {"algorithm": "bfs"}])
def test_route_rejects_bad_options(client, params):
    assert route(client, 0, 1, **params).status_code == 422


def test_route_rejects_points_far_from_any_road(client):
    response = client.get("/api/route", params={"from_lon": 84.0, "from_lat": 28.5, "to_lon": 85.3, "to_lat": 27.7})
    assert response.status_code == 422 and "no road within" in response.json()["detail"]


def test_route_requires_valid_coordinates(client):
    response = client.get("/api/route", params={"from_lon": 85.3, "from_lat": 95, "to_lon": 85.3, "to_lat": 27.7})
    assert response.status_code == 422


def test_route_avoids_closed_roads_and_reports_no_route(client, graph):
    graph.close_edges([16])  # 0 -> 4 and back
    assert route(client, 4, 0).status_code == 404
    assert route(client, 4, 0).json()["detail"] == "no open route between these points"
    graph.open_edges([16])
    assert route(client, 4, 0).status_code == 200


def test_nearest_ranks_by_road_and_ends_at_the_facility(client):
    body = client.get("/api/nearest", params={"lon": NODES[0][0], "lat": NODES[0][1], "limit": 5}).json()
    names = [r["facility"]["name"] for r in body["results"]]
    assert names == ["West Hospital", "Across the river"]
    west, across = body["results"]
    assert across["geometry"]["coordinates"][-1] == [85.3020, 27.7003]  # last stretch to the building
    assert across["straight_line_m"] < west["straight_line_m"]  # closer in a straight line...
    assert across["distance_m"] > west["distance_m"]            # ...but further by road


def test_nearest_respects_closures(client, graph):
    graph.close_edges([16])
    body = client.get("/api/nearest", params={"lon": NODES[0][0], "lat": NODES[0][1]}).json()
    assert [r["facility"]["name"] for r in body["results"]] == ["Across the river"]


def test_nearest_other_kinds(client):
    params = {"lon": NODES[0][0], "lat": NODES[0][1]}
    assert [r["facility"]["name"] for r in client.get("/api/nearest", params={**params, "kind": "police"})
            .json()["results"]] == ["North Police"]
    assert client.get("/api/nearest", params={**params, "kind": "fire_station"}).json()["results"] == []


@pytest.mark.parametrize("params", [{"kind": "school"}, {"limit": 0}, {"limit": 11}, {"weight": "x"}])
def test_nearest_rejects_bad_parameters(client, params):
    response = client.get("/api/nearest", params={"lon": NODES[0][0], "lat": NODES[0][1], **params})
    assert response.status_code == 422


def test_facilities_in_map_area(client):
    body = client.get("/api/facilities", params={"bbox": "85.29,27.69,85.32,27.72"}).json()
    assert body["type"] == "FeatureCollection"
    assert {f["properties"]["name"] for f in body["features"]} == {
        "Across the river", "West Hospital", "North Police", "Not on the network"}
    feature = next(f for f in body["features"] if f["properties"]["name"] == "West Hospital")
    assert feature["geometry"] == {"type": "Point", "coordinates": list(NODES[4])}


def test_facilities_filtered_by_kind_and_area(client):
    hospitals = client.get("/api/facilities", params={"bbox": "85.29,27.69,85.32,27.72", "kind": "hospital"}).json()
    assert {f["properties"]["kind"] for f in hospitals["features"]} == {"hospital"}
    several = client.get("/api/facilities", params=[("bbox", "85.29,27.69,85.32,27.72"), ("kind", "hospital"),
                                                    ("kind", "police")]).json()
    assert len(several["features"]) == 3
    elsewhere = client.get("/api/facilities", params={"bbox": "85.40,27.60,85.45,27.65"}).json()
    assert elsewhere["features"] == []


@pytest.mark.parametrize("bbox", ["1,2,3", "85.32,27.69,85.29,27.72", "84,27,86,29"])
def test_facilities_reject_bad_areas(client, bbox):
    assert client.get("/api/facilities", params={"bbox": bbox}).status_code == 422


def test_facility_detail(client):
    fid = client.get("/api/facilities", params={"bbox": "85.29,27.69,85.32,27.72", "kind": "police"}) \
        .json()["features"][0]["id"]
    body = client.get(f"/api/facilities/{fid}").json()
    assert body["name"] == "North Police" and body["phone"] == "01-4XXXXXX" and body["emergency"] is True
    assert body["source"] == "osm" and body["road"] is None


def test_facility_detail_with_road_distance(client):
    body = client.get("/api/facilities/1", params={"from_lon": NODES[0][0], "from_lat": NODES[0][1]}).json()
    assert body["name"] == "Across the river"
    assert body["road"]["distance_m"] > body["road"]["straight_line_m"]


def test_facility_off_the_network_has_no_road_distance(client):
    fid = client.get("/api/facilities", params={"bbox": "85.29,27.69,85.32,27.72", "kind": "pharmacy"}) \
        .json()["features"][0]["id"]
    body = client.get(f"/api/facilities/{fid}", params={"from_lon": NODES[0][0], "from_lat": NODES[0][1]}).json()
    assert body["road"] is None


def test_facility_detail_errors(client):
    assert client.get("/api/facilities/99999").status_code == 404
    assert client.get("/api/facilities/1", params={"from_lat": 27.7}).status_code == 422
