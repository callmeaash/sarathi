import argparse
import csv
import math
import random
import statistics
import sys
import time
from pathlib import Path

from app.db import get_engine
from app.routing.graph import RoadGraph, load_graph
from app.routing.search import Algorithm, NoRouteError, Weight, find_route

FIELDS = ["pair", "source", "target", "weight", "algorithm", "cost", "length_m", "travel_time_s",
          "visited_nodes", "runtime_ms"]


def random_pairs(graph: RoadGraph, count: int, seed: int) -> list[tuple[int, int]]:
    """Pick reproducible random (source, target) node pairs with distinct ends."""
    if graph.node_count < 2:
        raise ValueError("need at least two nodes to benchmark")
    rng = random.Random(seed)
    pairs = []
    while len(pairs) < count:
        a, b = rng.sample(graph.node_ids, 2)
        pairs.append((a, b))
    return pairs


def compare(graph: RoadGraph, pairs: list[tuple[int, int]], weight: Weight) -> list[dict]:
    """Route every pair with Dijkstra and A*, checking both find the same cost."""
    rows = []
    for i, (source, target) in enumerate(pairs):
        try:
            routes = [find_route(graph, source, target, weight, algo) for algo in Algorithm]
        except NoRouteError:
            continue
        dijkstra, astar = routes
        if not math.isclose(dijkstra.cost, astar.cost, rel_tol=1e-9, abs_tol=1e-6):
            raise AssertionError(f"pair {source}->{target}: Dijkstra {dijkstra.cost} != A* {astar.cost}")
        for route in routes:
            rows.append({"pair": i, "source": source, "target": target, "weight": weight.value,
                         "algorithm": route.algorithm.value, "cost": route.cost, "length_m": route.length_m,
                         "travel_time_s": route.travel_time_s, "visited_nodes": route.visited_nodes,
                         "runtime_ms": route.runtime_ms})
    return rows


def summarise(rows: list[dict]) -> str:
    """Format median and mean visited nodes and run time per algorithm."""
    lines = [f"{'algorithm':10} {'routes':>7} {'median visited':>15} {'mean visited':>13} "
             f"{'median ms':>10} {'mean ms':>8}"]
    for algo in Algorithm:
        subset = [r for r in rows if r["algorithm"] == algo.value]
        if not subset:
            continue
        visited = [r["visited_nodes"] for r in subset]
        ms = [r["runtime_ms"] for r in subset]
        lines.append(f"{algo.value:10} {len(subset):>7} {statistics.median(visited):>15,.0f} "
                     f"{statistics.mean(visited):>13,.0f} {statistics.median(ms):>10.1f} {statistics.mean(ms):>8.1f}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    """Benchmark Dijkstra against A* on random routes in the imported road network."""
    parser = argparse.ArgumentParser(prog="python -m app.routing.benchmark")
    parser.add_argument("--pairs", type=int, default=100)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--weight", choices=[w.value for w in Weight], default=Weight.TIME.value)
    parser.add_argument("--csv", type=Path, help="write every route to this CSV file")
    args = parser.parse_args(argv)
    if args.pairs < 1:
        parser.error("--pairs must be at least 1")

    started = time.perf_counter()
    graph = load_graph(get_engine())
    print(f"loaded {graph.node_count:,} nodes and {graph.edge_count:,} edges in "
          f"{time.perf_counter() - started:.1f} s")

    rows = compare(graph, random_pairs(graph, args.pairs, args.seed), Weight(args.weight))
    print(f"{args.weight} routes, Dijkstra and A* agree on every cost\n")
    print(summarise(rows))
    if args.csv:
        args.csv.parent.mkdir(parents=True, exist_ok=True)
        with args.csv.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(rows)
        print(f"\nwrote {len(rows)} rows to {args.csv}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
