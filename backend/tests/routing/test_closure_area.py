import pytest
from sqlalchemy import text

from app.routing.closures import MAX_RADIUS_M, edges_near
from tests.conftest import needs_db

# A divided road crossing a river: two one-way carriageways about 15 m apart, plus a road 200 m away.
NODES = {1: (85.3000, 27.7000), 2: (85.3020, 27.7000), 3: (85.3020, 27.70014), 4: (85.3000, 27.70014),
         5: (85.3000, 27.7020), 6: (85.3020, 27.7020)}
EDGES = [(1, 2), (3, 4), (5, 6)]  # eastbound, westbound, far road
BRIDGE_POINT = (85.3010, 27.70007)


@pytest.fixture
def conn(db_engine):
    with db_engine.begin() as c:
        c.execute(text("TRUNCATE facilities, road_edges, road_nodes RESTART IDENTITY CASCADE"))
        for node, (x, y) in NODES.items():
            c.execute(text("INSERT INTO road_nodes (id, geom) VALUES (:id, ST_SetSRID(ST_MakePoint(:x, :y), 4326))"),
                      {"id": node, "x": x, "y": y})
        for i, (s, t) in enumerate(EDGES, start=1):
            c.execute(text("""
                INSERT INTO road_edges (id, source, target, key, highway, oneway, bridge, tunnel, length_m,
                                        speed_kph, travel_time_s, geom)
                VALUES (:id, :s, :t, 0, 'trunk', true, true, false, 200, 40, 18,
                        ST_MakeLine(ST_SetSRID(ST_MakePoint(:sx, :sy), 4326), ST_SetSRID(ST_MakePoint(:tx, :ty), 4326)))
            """), {"id": i, "s": s, "t": t, "sx": NODES[s][0], "sy": NODES[s][1], "tx": NODES[t][0], "ty": NODES[t][1]})
    with db_engine.connect() as c:
        yield c


@needs_db
def test_both_carriageways_are_found(conn):
    assert edges_near(conn, *BRIDGE_POINT, radius_m=30) == [1, 2]


@needs_db
def test_radius_limits_the_result(conn):
    assert edges_near(conn, *BRIDGE_POINT, radius_m=5) == []      # the point sits between the carriageways
    assert edges_near(conn, *BRIDGE_POINT, radius_m=300) == [1, 2, 3]


@needs_db
def test_nothing_nearby(conn):
    assert edges_near(conn, 85.40, 27.80, radius_m=50) == []


@pytest.mark.parametrize("lon, lat, radius", [
    (85.3, 27.7, 0), (85.3, 27.7, -10), (85.3, 27.7, MAX_RADIUS_M + 1), (200, 27.7, 30), (85.3, -95, 30),
])
def test_invalid_input_is_rejected_before_querying(lon, lat, radius):
    with pytest.raises(ValueError):
        edges_near(None, lon, lat, radius)
