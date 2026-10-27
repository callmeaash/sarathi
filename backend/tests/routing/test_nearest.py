import random

import pytest
from sqlalchemy import text

from app.routing.evaluate_nearest import compare_point, evaluate, summarise
from app.routing.graph import haversine_m
from app.routing.nearest import (
    Facility, access_time_s, build_facility_index, load_facilities, nearest_facilities, straight_line_nearest,
)
from app.routing.search import Weight, find_route
from tests.conftest import graph_from, needs_db
from tests.routing.test_search import random_city

#  2 ----- 3        A hospital (node 1) sits just across a river from the start (node 0),
#  |       |        but the only bridge is up north, so the road goes 0-2-3-1.
#  |  river|        Hospital B (node 4) is further away in a straight line but has a direct road.
#  0 ~~~~~ 1
#  |
#  4
RIVER = {0: (85.3000, 27.7000), 1: (85.3020, 27.7000), 2: (85.3000, 27.7100), 3: (85.3020, 27.7100),
         4: (85.2960, 27.7000), 5: (85.3500, 27.7500)}
SPEED_MPS = 10


def roads(*pairs, one_way=()):
    out = []
    for a, b in pairs:
        seconds = haversine_m(*RIVER[a], *RIVER[b]) / SPEED_MPS
        out.append((a, b, seconds))
        if (a, b) not in one_way:
            out.append((b, a, seconds))
    return out


@pytest.fixture
def river():
    return graph_from(RIVER, roads((0, 2), (2, 3), (3, 1), (0, 4)))


def facility(fid, node, kind="hospital", access=0.0, name=None):
    lon, lat = RIVER[node]
    return Facility(fid, kind, name or f"F{fid}", lon, lat, node, access)


def test_road_nearest_beats_straight_line_nearest(river):
    index = build_facility_index(river, [facility(1, 1, name="Across the river"), facility(2, 4, name="West")])
    best = nearest_facilities(river, index, 0, "hospital")
    assert [r.facility.name for r in best] == ["West"]
    assert best[0].length_m == pytest.approx(haversine_m(*RIVER[0], *RIVER[4]))
    assert straight_line_nearest(index, "hospital", *RIVER[0]).name == "Across the river"
    assert best[0].straight_line_m > haversine_m(*RIVER[0], *RIVER[1])


def test_limit_returns_closest_first(river):
    index = build_facility_index(river, [facility(1, 1), facility(2, 4), facility(3, 2)])
    results = nearest_facilities(river, index, 0, "hospital", limit=5)
    assert [r.facility.id for r in results] == [2, 3, 1]
    times = [r.travel_time_s for r in results]
    assert times == sorted(times)


def test_access_distance_can_change_the_answer(river):
    # Node 4 is reached first, but its facility is a long way from the road; the one across the river wins.
    index = build_facility_index(river, [facility(1, 4, access=3000), facility(2, 1)])
    best = nearest_facilities(river, index, 0, "hospital", Weight.LENGTH)[0]
    assert best.facility.id == 2
    by_time = nearest_facilities(river, index, 0, "hospital", Weight.TIME)[0]
    assert by_time.facility.id == 2
    assert by_time.travel_time_s == pytest.approx(by_time.route.travel_time_s)


def test_access_is_added_to_length_and_time(river):
    index = build_facility_index(river, [facility(1, 4, access=50)])
    result = nearest_facilities(river, index, 0, "hospital")[0]
    assert result.length_m == pytest.approx(result.route.length_m + 50)
    assert result.travel_time_s == pytest.approx(result.route.travel_time_s + access_time_s(50))


def test_facility_at_the_start_node(river):
    index = build_facility_index(river, [facility(1, 0, access=20), facility(2, 4)])
    result = nearest_facilities(river, index, 0, "hospital")[0]
    assert result.facility.id == 1
    assert result.route.edge_ids == [] and result.length_m == 20


def test_only_the_requested_kind(river):
    index = build_facility_index(river, [facility(1, 4, "pharmacy"), facility(2, 1, "police")])
    assert [r.facility.id for r in nearest_facilities(river, index, 0, "police")] == [2]
    assert nearest_facilities(river, index, 0, "fire_station") == []


def test_unreachable_facilities_are_skipped(river):
    index = build_facility_index(river, [facility(1, 5), facility(2, 1)])
    assert [r.facility.id for r in nearest_facilities(river, index, 0, "hospital", limit=5)] == [2]
    only_unreachable = build_facility_index(river, [facility(1, 5)])
    assert nearest_facilities(river, only_unreachable, 0, "hospital") == []


def test_one_way_roads_are_respected():
    graph = graph_from(RIVER, roads((0, 2), (2, 3), (3, 1), (1, 0), one_way={(1, 0)}))
    index = build_facility_index(graph, [facility(1, 1)])
    from_start = nearest_facilities(graph, index, 0, "hospital")[0]
    assert from_start.route.node_ids == [0, 2, 3, 1]  # cannot use the one-way 1 -> 0 backwards


@pytest.mark.parametrize("kwargs, error", [
    ({"kind": "school"}, ValueError), ({"kind": "hospital", "limit": 0}, ValueError),
    ({"kind": "hospital", "weight": "cheapest"}, ValueError),
])
def test_invalid_arguments(river, kwargs, error):
    index = build_facility_index(river, [facility(1, 1)])
    with pytest.raises(error):
        nearest_facilities(river, index, 0, **kwargs)


def test_unknown_start_node(river):
    index = build_facility_index(river, [facility(1, 1)])
    with pytest.raises(KeyError):
        nearest_facilities(river, index, 999, "hospital")


def test_index_skips_facilities_off_the_network(river):
    index = build_facility_index(river, [facility(1, 1), Facility(2, "hospital", "Lost", 85.4, 27.8, 999, 0)])
    assert index.count("hospital") == 1 and index.skipped == 1
    assert straight_line_nearest(index, "police", 85.3, 27.7) is None


@pytest.mark.parametrize("seed", range(4))
@pytest.mark.parametrize("weight", list(Weight))
def test_matches_brute_force_on_random_cities(seed, weight):
    coords, _, graph = random_city(seed)
    rng = random.Random(seed)
    facilities = [Facility(i, "hospital", None, *coords[node], node, rng.uniform(0, 300))
                  for i, node in enumerate(rng.sample(sorted(coords), 12))]
    index = build_facility_index(graph, facilities)
    for source in rng.sample(sorted(coords), 15):
        expected = []
        for f in facilities:
            try:
                route = find_route(graph, source, f.node_id, weight)
            except Exception:
                continue
            extra = f.access_m if weight is Weight.LENGTH else access_time_s(f.access_m)
            expected.append(route.cost + extra)
        expected.sort()
        got = nearest_facilities(graph, index, source, "hospital", weight, limit=3)
        got_costs = [r.length_m if weight is Weight.LENGTH else r.travel_time_s for r in got]
        assert got_costs == pytest.approx(expected[:3], rel=1e-9)


def test_compare_point_measures_the_cost_of_the_straight_line_choice(river):
    index = build_facility_index(river, [facility(1, 1), facility(2, 4)])
    comparison = compare_point(river, index, 0, "hospital")
    assert comparison.differs
    assert comparison.road_nearest_id == 2 and comparison.straight_nearest_id == 1
    assert comparison.extra_time_s > 0


def test_compare_point_when_both_agree(river):
    index = build_facility_index(river, [facility(1, 4)])
    comparison = compare_point(river, index, 0, "hospital")
    assert not comparison.differs and comparison.extra_time_s == 0


def test_evaluate_and_summarise(river):
    index = build_facility_index(river, [facility(1, 1), facility(2, 4)])
    results = evaluate(river, index, "hospital", points=10, seed=1)
    assert results and all(r.road_time_s >= 0 for r in results)
    assert summarise("hospital", results).startswith("hospital")
    assert "no results" in summarise("police", [])


@needs_db
def test_load_facilities_from_database(db_engine):
    with db_engine.begin() as conn:
        conn.execute(text("TRUNCATE facilities, road_edges, road_nodes RESTART IDENTITY CASCADE"))
        for node in (0, 1):
            conn.execute(text("INSERT INTO road_nodes (id, geom) VALUES (:id, ST_SetSRID(ST_MakePoint(:x, :y), 4326))"),
                         {"id": node, "x": RIVER[node][0], "y": RIVER[node][1]})
        conn.execute(text("""
            INSERT INTO facilities (osm_type, osm_id, kind, name, name_en, geom, nearest_node_id,
                                    snap_distance_m, source)
            VALUES ('node', 1, 'hospital', 'वीर अस्पताल', 'Bir Hospital',
                    ST_SetSRID(ST_MakePoint(85.302, 27.7), 4326), 1, 12.5, 'osm'),
                   ('node', 2, 'police', 'Teku Police', NULL,
                    ST_SetSRID(ST_MakePoint(85.300, 27.7), 4326), NULL, NULL, 'osm')
        """))
    graph = graph_from({0: RIVER[0], 1: RIVER[1]}, roads((0, 1)))
    index = load_facilities(db_engine, graph)
    assert index.count("hospital") == 1 and index.count("police") == 0  # not linked to a road node
    bir = index.all("hospital")[0]
    assert bir.name == "Bir Hospital" and bir.node_id == 1 and bir.access_m == 12.5
