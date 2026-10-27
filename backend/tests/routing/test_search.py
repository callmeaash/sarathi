import random

import networkx as nx
import pytest

from app.routing.graph import haversine_m
from app.routing.search import Algorithm, NoRouteError, Weight, find_route
from tests.conftest import graph_from

BOTH = list(Algorithm)

#   1 ---- 2      1 -> 2 is one-way; everything else is two-way
#    \    /
#      3
TRIANGLE = {1: (85.300, 27.700), 2: (85.305, 27.700), 3: (85.3025, 27.703)}


@pytest.fixture
def triangle():
    return graph_from(TRIANGLE, [
        (1, 2, 300, 1000),             # direct but slow (residential lane)
        (1, 3, 30, 700), (3, 1, 30, 700),
        (3, 2, 30, 700), (2, 3, 30, 700),
    ])


@pytest.mark.parametrize("algorithm", BOTH)
def test_same_start_and_end(triangle, algorithm):
    route = find_route(triangle, 2, 2, algorithm=algorithm)
    assert route.node_ids == [2] and route.edge_ids == [] and route.cost == 0 and route.length_m == 0


@pytest.mark.parametrize("algorithm", BOTH)
def test_shortest_and_fastest_take_different_roads(triangle, algorithm):
    shortest = find_route(triangle, 1, 2, Weight.LENGTH, algorithm)
    fastest = find_route(triangle, 1, 2, Weight.TIME, algorithm)
    assert shortest.node_ids == [1, 2] and shortest.length_m == 1000 and shortest.travel_time_s == 300
    assert fastest.node_ids == [1, 3, 2] and fastest.length_m == 1400 and fastest.travel_time_s == 60
    assert shortest.cost == shortest.length_m and fastest.cost == fastest.travel_time_s


@pytest.mark.parametrize("algorithm", BOTH)
def test_one_way_road_is_not_used_backwards(triangle, algorithm):
    route = find_route(triangle, 2, 1, Weight.LENGTH, algorithm)
    assert route.node_ids == [2, 3, 1]


@pytest.mark.parametrize("algorithm", BOTH)
def test_cheaper_parallel_road_is_chosen(algorithm):
    graph = graph_from(TRIANGLE, [(1, 2, 100, 900), (1, 2, 40, 800)])
    route = find_route(graph, 1, 2, Weight.TIME, algorithm)
    assert route.edge_ids == [1001] and route.travel_time_s == 40


@pytest.mark.parametrize("algorithm", BOTH)
def test_unreachable_target(algorithm):
    graph = graph_from({**TRIANGLE, 4: (85.31, 27.71)}, [(1, 2, 300, 1000)])
    with pytest.raises(NoRouteError):
        find_route(graph, 1, 4, algorithm=algorithm)
    with pytest.raises(NoRouteError):
        find_route(graph, 2, 1, algorithm=algorithm)  # only the one-way exists


def test_unknown_node(triangle):
    with pytest.raises(KeyError):
        find_route(triangle, 1, 999)


def test_accepts_string_options_and_rejects_bad_ones(triangle):
    assert find_route(triangle, 1, 2, "length", "astar").algorithm is Algorithm.ASTAR
    with pytest.raises(ValueError):
        find_route(triangle, 1, 2, weight="cheapest")
    with pytest.raises(ValueError):
        find_route(triangle, 1, 2, algorithm="bfs")


def test_astar_without_speed_information_falls_back_to_dijkstra_behaviour():
    graph = graph_from(TRIANGLE, [(1, 3, 0), (3, 2, 0)])
    route = find_route(graph, 1, 2, Weight.TIME, Algorithm.ASTAR)
    assert route.node_ids == [1, 3, 2] and route.cost == 0


def random_city(seed: int, n: int = 80):
    # Random street network: each node links to its nearest neighbours, some links one-way, roads curve
    # (length >= straight line) and have different speeds.
    rng = random.Random(seed)
    coords = {i: (85.30 + rng.random() * 0.02, 27.70 + rng.random() * 0.02) for i in range(n)}
    roads = []
    for i, (x, y) in coords.items():
        near = sorted(coords, key=lambda j: (coords[j][0] - x) ** 2 + (coords[j][1] - y) ** 2)[1:4]
        for j in near:
            length = haversine_m(*coords[i], *coords[j]) * rng.uniform(1.0, 1.6)
            seconds = length / (rng.uniform(10, 40) / 3.6)
            roads.append((i, j, seconds, length))
            if rng.random() < 0.8:
                roads.append((j, i, seconds, length))
    return coords, roads, graph_from(coords, roads)


def networkx_cost(roads, source, target, weight: Weight):
    g = nx.MultiDiGraph()
    for s, t, seconds, length in roads:
        g.add_edge(s, t, length=length, time=seconds)
    try:
        return nx.shortest_path_length(g, source, target, weight="length" if weight is Weight.LENGTH else "time")
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return None


@pytest.mark.parametrize("seed", range(5))
@pytest.mark.parametrize("weight", list(Weight))
def test_dijkstra_and_astar_match_networkx_on_random_cities(seed, weight):
    coords, roads, graph = random_city(seed)
    rng = random.Random(seed + 100)
    for _ in range(40):
        source, target = rng.sample(sorted(coords), 2)
        expected = networkx_cost(roads, source, target, weight)
        for algorithm in Algorithm:
            if expected is None:
                with pytest.raises(NoRouteError):
                    find_route(graph, source, target, weight, algorithm)
                continue
            route = find_route(graph, source, target, weight, algorithm)
            assert route.cost == pytest.approx(expected, rel=1e-9)
            total = route.length_m if weight is Weight.LENGTH else route.travel_time_s
            assert total == pytest.approx(route.cost, rel=1e-9)
            assert route.node_ids[0] == source and route.node_ids[-1] == target
            assert len(route.edge_ids) == len(route.node_ids) - 1


def test_astar_visits_fewer_nodes_than_dijkstra():
    coords, _, graph = random_city(seed=7, n=150)
    rng = random.Random(1)
    totals = {algorithm: 0 for algorithm in Algorithm}
    for _ in range(30):
        source, target = rng.sample(sorted(coords), 2)
        for algorithm in Algorithm:
            try:
                totals[algorithm] += find_route(graph, source, target, Weight.LENGTH, algorithm).visited_nodes
            except NoRouteError:
                pass
    assert totals[Algorithm.ASTAR] < totals[Algorithm.DIJKSTRA]
