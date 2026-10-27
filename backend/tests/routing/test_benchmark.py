import pytest

from app.routing.benchmark import compare, random_pairs, summarise
from app.routing.graph import build_graph
from app.routing.search import Weight
from tests.routing.test_search import random_city


def test_random_pairs_are_reproducible_and_distinct():
    _, _, graph = random_city(seed=3)
    pairs = random_pairs(graph, 20, seed=9)
    assert pairs == random_pairs(graph, 20, seed=9)
    assert len(pairs) == 20 and all(a != b for a, b in pairs)


def test_random_pairs_needs_two_nodes():
    with pytest.raises(ValueError):
        random_pairs(build_graph([(1, 85.3, 27.7)], []), 5, seed=1)


def test_compare_routes_every_reachable_pair_with_both_algorithms():
    _, _, graph = random_city(seed=4)
    rows = compare(graph, random_pairs(graph, 15, seed=2), Weight.TIME)
    pairs = {r["pair"] for r in rows}
    assert len(rows) == 2 * len(pairs)
    for pair in pairs:
        costs = {r["algorithm"]: r["cost"] for r in rows if r["pair"] == pair}
        assert costs["dijkstra"] == pytest.approx(costs["astar"])
    table = summarise(rows)
    assert "dijkstra" in table and "astar" in table
