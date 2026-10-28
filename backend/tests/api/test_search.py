import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.auth.email import MemoryEmail
from app.main import create_app
from tests.conftest import TEST_AUTH, needs_db
from tests.seed import NODES, seed_network

pytestmark = needs_db


@pytest.fixture(scope="module")
def client(db_engine):
    seed_network(db_engine, road_names={(0, 4): "Kalimati Marg", (0, 2): "Teku Road", (2, 3): "Teku Road"})
    with db_engine.begin() as conn:  # a Nepali-only name, as many OSM places have
        conn.execute(text("UPDATE facilities SET name_ne = 'प्रहरी चौकी' WHERE name = 'North Police'"))
    with TestClient(create_app(engine=db_engine, auth_settings=TEST_AUTH, sender=MemoryEmail())) as c:
        yield c


def search(client, q, **params):
    return client.get("/api/search", params={"q": q, **params})


def names(response):
    return [hit["name"] for hit in response.json()]


def test_finds_a_facility_by_name(client):
    (hit,) = search(client, "west hosp").json()
    assert hit["type"] == "facility" and hit["name"] == "West Hospital" and hit["kind"] == "hospital"
    assert (hit["lon"], hit["lat"]) == pytest.approx(NODES[4])
    assert hit["distance_m"] is None


def test_matches_the_start_of_any_word(client):
    assert names(search(client, "hosp")) == ["West Hospital"]


def test_tolerates_small_typos(client):
    assert "West Hospital" in names(search(client, "west hospitl"))


def test_finds_roads_once_each_with_a_point_on_them(client):
    hits = search(client, "teku").json()
    assert [(h["type"], h["name"]) for h in hits] == [("road", "Teku Road")]  # two segments, one result
    lon, lat = hits[0]["lon"], hits[0]["lat"]
    on_0_2 = lon == pytest.approx(85.3000) and 27.70 <= lat <= 27.71
    on_2_3 = lat == pytest.approx(27.7100) and 85.30 <= lon <= 85.302
    assert on_0_2 or on_2_3


def test_finds_nepali_names(client):
    assert names(search(client, "प्रहरी")) == ["North Police"]


def test_names_starting_with_the_query_come_first(client):
    seeded = search(client, "west").json()
    assert seeded[0]["name"] == "West Hospital"
    assert names(search(client, "kalimati")) == ["Kalimati Marg"]


def test_reports_distance_from_a_point(client):
    (hit,) = search(client, "west hosp", lon=NODES[0][0], lat=NODES[0][1]).json()
    assert hit["distance_m"] == pytest.approx(395, abs=5)


def test_wildcards_are_plain_characters(client):
    assert search(client, "%%").json() == []
    assert search(client, "__").json() == []


def test_limits_results(client):
    assert len(search(client, "ro").json()) >= 2  # "Across the river", "Teku Road"
    assert len(search(client, "ro", limit=1).json()) == 1


@pytest.mark.parametrize("params", [{"q": " a "}, {"q": "x" * 61}, {"q": "west", "lat": 27.7},
                                    {"q": "west", "limit": 0}])
def test_rejects_bad_queries(client, params):
    assert client.get("/api/search", params=params).status_code == 422
