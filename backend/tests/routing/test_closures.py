import random

import networkx as nx
import pytest

from app.routing.nearest import Facility, build_facility_index, nearest_facilities
from app.routing.search import Algorithm, NoRouteError, Weight, find_route
from tests.conftest import graph_from
from tests.routing.test_search import random_city

BOTH = list(Algorithm)

#  0 ==bridge== 1
#  |            |       The bridge 0-1 is the short way from 0 to 3; the detour goes 0-2-3.
#  2 ---------- 3 ---- 1
CITY = {0: (85.3000, 27.7000), 1: (85.3040, 27.7000), 2: (85.3000, 27.6960), 3: (85.3040, 27.6960)}
BRIDGE, BRIDGE_BACK = 1000, 1001  # edge ids follow the order of ROADS (graph_from numbers them from 1000)
ROADS = [
    (0, 1, 40), (1, 0, 40),     # bridge
    (1, 3, 40), (3, 1, 40),
    (0, 2, 40), (2, 0, 40),
    (2, 3, 40), (3, 2, 40),
]


@pytest.fixture
def city():
    return graph_from(CITY, ROADS)


@pytest.mark.parametrize("algorithm", BOTH)
def test_closing_a_road_forces_a_detour_and_reopening_restores_it(city, algorithm):
    assert find_route(city, 0, 1, algorithm=algorithm).node_ids == [0, 1]
    assert city.close_edges([BRIDGE]) == [BRIDGE, BRIDGE_BACK]
    assert find_route(city, 0, 1, algorithm=algorithm).node_ids == [0, 2, 3, 1]
    assert city.open_edges([BRIDGE]) == [BRIDGE, BRIDGE_BACK]
    assert find_route(city, 0, 1, algorithm=algorithm).node_ids == [0, 1]


def test_both_directions_are_closed_by_default(city):
    city.close_edges([BRIDGE])
    assert city.is_closed(BRIDGE) and city.is_closed(BRIDGE_BACK)
    assert find_route(city, 1, 0).node_ids == [1, 3, 2, 0]


def test_closing_one_direction_only(city):
    assert city.close_edges([BRIDGE], both_directions=False) == [BRIDGE]
    assert find_route(city, 0, 1).node_ids == [0, 2, 3, 1]
    assert find_route(city, 1, 0).node_ids == [1, 0]


def test_closures_are_counted(city):
    city.close_edges([BRIDGE])                    # hazard A
    assert city.close_edges([BRIDGE]) == []       # hazard B on the same road: already closed
    assert city.open_edges([BRIDGE]) == []        # A cleared: B still blocks the road
    assert city.is_closed(BRIDGE)
    assert city.open_edges([BRIDGE]) == [BRIDGE, BRIDGE_BACK]  # B cleared
    assert not city.is_closed(BRIDGE)


def test_opening_an_open_road_does_nothing(city):
    assert city.open_edges([BRIDGE]) == []
    assert city.closures == [0] * city.edge_count
    city.close_edges([BRIDGE])
    assert city.is_closed(BRIDGE)  # count never went negative


def test_unknown_edge_changes_nothing(city):
    with pytest.raises(KeyError, match="not in the road graph"):
        city.close_edges([BRIDGE, 99999])
    assert city.closed_edge_ids() == []


def test_closing_several_roads_at_once(city):
    assert set(city.close_edges([BRIDGE, 1006])) == {BRIDGE, BRIDGE_BACK, 1006, 1007}
    assert set(city.closed_edge_ids()) == {BRIDGE, BRIDGE_BACK, 1006, 1007}


def test_parallel_road_is_not_mistaken_for_the_other_direction():
    graph = graph_from(CITY, [(0, 1, 40, 500), (1, 0, 40, 500), (1, 0, 90, 900)])
    assert graph.close_edges([1000]) == [1000, 1001]  # the 900 m road back is a different road
    assert find_route(graph, 1, 0).edge_ids == [1002]


def test_closing_a_one_way_road_has_no_other_direction():
    graph = graph_from(CITY, [(0, 1, 40), (1, 3, 40), (3, 2, 40), (2, 0, 40)])
    assert graph.close_edges([1000]) == [1000]


@pytest.mark.parametrize("algorithm", BOTH)
def test_closures_can_cut_off_a_destination(algorithm):
    graph = graph_from(CITY, [(0, 1, 40), (1, 0, 40), (1, 3, 40), (3, 1, 40)])
    graph.close_edges([1002])
    with pytest.raises(NoRouteError):
        find_route(graph, 0, 3, algorithm=algorithm)
    assert find_route(graph, 3, 3, algorithm=algorithm).cost == 0  # staying put is always possible


def test_nearest_facility_avoids_closed_roads(city):
    near = Facility(1, "hospital", "Across the bridge", *CITY[1], 1, 0)
    far = Facility(2, "hospital", "Detour side", *CITY[2], 2, 0)
    index = build_facility_index(city, [near, far])
    assert nearest_facilities(city, index, 0, "hospital", Weight.LENGTH)[0].facility.id == 1
    city.close_edges([BRIDGE])
    best = nearest_facilities(city, index, 0, "hospital", Weight.LENGTH)
    assert best[0].facility.id == 2
    assert all(BRIDGE not in r.route.edge_ids for r in nearest_facilities(city, index, 0, "hospital", limit=2))


@pytest.mark.parametrize("seed", range(4))
def test_routes_with_random_closures_match_networkx(seed):
    coords, roads, graph = random_city(seed)
    rng = random.Random(seed)
    closed = rng.sample(graph.edge_ids, len(graph.edge_ids) // 5)
    graph.close_edges(closed, both_directions=False)
    blocked = set(closed)

    g = nx.MultiDiGraph()
    g.add_nodes_from(coords)
    for i, (s, t, seconds, length) in enumerate(roads):
        if 1000 + i not in blocked:
            g.add_edge(s, t, time=seconds)
    for _ in range(40):
        source, target = rng.sample(sorted(coords), 2)
        try:
            expected = nx.shortest_path_length(g, source, target, weight="time")
        except nx.NetworkXNoPath:
            expected = None
        for algorithm in BOTH:
            if expected is None:
                with pytest.raises(NoRouteError):
                    find_route(graph, source, target, Weight.TIME, algorithm)
            else:
                route = find_route(graph, source, target, Weight.TIME, algorithm)
                assert route.cost == pytest.approx(expected, rel=1e-9)
                assert not blocked & set(route.edge_ids)
