import pytest
from fastapi.testclient import TestClient

from app.auth.email import MemoryEmail
from app.main import create_app
from tests.conftest import TEST_AUTH, needs_db
from tests.seed import seed_network

pytestmark = needs_db


@pytest.fixture(scope="module")
def client(db_engine):
    seed_network(db_engine, road_names={(0, 4): "Kalimati Marg"})
    with TestClient(create_app(engine=db_engine, auth_settings=TEST_AUTH, sender=MemoryEmail())) as c:
        yield c


def nearest(client, lon, lat):
    return client.get("/api/roads/nearest", params={"lon": lon, "lat": lat})


def test_names_the_closest_road_and_the_spot_on_it(client):
    body = nearest(client, 85.2980, 27.7005).json()  # about 55 m north of road 0-4
    assert body["road_name"] == "Kalimati Marg"
    assert body["distance_m"] == pytest.approx(55.4, abs=1)
    assert (body["lon"], body["lat"]) == pytest.approx((85.2980, 27.7000), abs=1e-6)


def test_unnamed_roads_have_no_name(client):
    body = nearest(client, 85.3010, 27.7101).json()  # on road 2-3
    assert body["road_name"] is None and body["distance_m"] < 15


def test_nothing_near(client):
    response = nearest(client, 85.40, 27.80)
    assert response.status_code == 404 and "no road within 500 m" in response.json()["detail"]


@pytest.mark.parametrize("params", [{"lon": 85.3}, {"lon": 85.3, "lat": 95}])
def test_rejects_bad_points(client, params):
    assert client.get("/api/roads/nearest", params=params).status_code == 422
