import math

import pytest
from sqlalchemy import text

from app.routing.graph import build_graph, haversine_m, load_graph
from tests.conftest import needs_db

NODES = [(10, 85.300, 27.700), (20, 85.301, 27.700), (30, 85.302, 27.700)]


def test_haversine_known_distance():
    # 0.001° of longitude at 27.7° N is about 98.5 m
    assert haversine_m(85.300, 27.7, 85.301, 27.7) == pytest.approx(98.5, abs=0.5)
    assert haversine_m(85.3, 27.7, 85.3, 27.7) == 0
    assert haversine_m(85.300, 27.7, 85.301, 27.71) == pytest.approx(haversine_m(85.301, 27.71, 85.300, 27.7))


def test_build_graph_groups_edges_by_source():
    graph = build_graph(NODES, [(1, 20, 30, 100, 10), (2, 10, 20, 100, 10), (3, 20, 10, 100, 10)])
    assert graph.node_count == 3 and graph.edge_count == 3
    assert graph.offsets == [0, 1, 3, 3]  # node 10: 1 edge, node 20: 2 edges, node 30: none
    out_of_20 = {graph.edge_ids[p] for p in range(graph.offsets[1], graph.offsets[2])}
    assert out_of_20 == {1, 3}


def test_build_graph_max_speed_ignores_zero_time_edges():
    graph = build_graph(NODES, [(1, 10, 20, 100, 10), (2, 20, 30, 300, 20), (3, 30, 10, 50, 0)])
    assert graph.max_speed_mps == 15


def test_build_graph_allows_nodes_without_edges():
    graph = build_graph(NODES, [])
    assert graph.edge_count == 0 and graph.max_speed_mps == 0


@pytest.mark.parametrize("edge, message", [
    ((1, 10, 99, 100, 10), "not in the graph"),
    ((1, 10, 20, -1, 10), "negative or missing"),
    ((1, 10, 20, 100, -5), "negative or missing"),
    ((1, 10, 20, math.nan, 10), "negative or missing"),
])
def test_build_graph_rejects_bad_edges(edge, message):
    with pytest.raises(ValueError, match=message):
        build_graph(NODES, [edge])


def test_build_graph_rejects_duplicate_nodes():
    with pytest.raises(ValueError, match="duplicate"):
        build_graph(NODES + [NODES[0]], [])


def test_node_index_unknown_node():
    graph = build_graph(NODES, [])
    assert graph.node_index(20) == 1
    with pytest.raises(KeyError, match="not in the road graph"):
        graph.node_index(99)


@needs_db
def test_load_graph_from_database(db_engine):
    with db_engine.begin() as conn:
        conn.execute(text("TRUNCATE facilities, road_edges, road_nodes RESTART IDENTITY CASCADE"))
        for node_id, lon, lat in NODES:
            conn.execute(text("INSERT INTO road_nodes (id, geom) VALUES (:id, ST_SetSRID(ST_MakePoint(:x, :y), 4326))"),
                         {"id": node_id, "x": lon, "y": lat})
        conn.execute(text("""
            INSERT INTO road_edges (source, target, key, highway, oneway, bridge, tunnel, length_m, speed_kph,
                                    travel_time_s, geom)
            VALUES (10, 20, 0, 'primary', true, false, false, 98.5, 35, 10.1,
                    ST_GeomFromText('LINESTRING(85.300 27.7, 85.301 27.7)', 4326))"""))
    graph = load_graph(db_engine)
    assert graph.node_ids == [10, 20, 30]
    assert graph.lon[0] == pytest.approx(85.300)
    assert graph.edge_count == 1 and graph.length_m == [98.5]


@needs_db
def test_load_graph_empty_database_explains_what_to_do(db_engine):
    with db_engine.begin() as conn:
        conn.execute(text("TRUNCATE facilities, road_edges, road_nodes RESTART IDENTITY CASCADE"))
    with pytest.raises(RuntimeError, match="python -m pipeline"):
        load_graph(db_engine)
