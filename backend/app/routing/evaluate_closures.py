import argparse
import json
import statistics
import sys
from pathlib import Path

from app.db import get_engine
from app.routing.benchmark import random_pairs
from app.routing.graph import RoadGraph, load_graph
from app.routing.search import Algorithm, NoRouteError, Weight, find_route


def evaluate(graph: RoadGraph, pairs: list[tuple[int, int]]) -> dict:
    """Close the middle road of each fastest route and route again, to see what a closure costs a traveller."""
    routed = rerouted = cut_off = 0
    extra_s, extra_m = [], []
    for source, target in pairs:
        try:
            usual = find_route(graph, source, target, Weight.TIME, Algorithm.ASTAR)
        except NoRouteError:
            continue
        if len(usual.edge_ids) < 3:
            continue  # too short to have a middle road distinct from its ends
        routed += 1
        closed = graph.close_edges([usual.edge_ids[len(usual.edge_ids) // 2]])
        try:
            detour = find_route(graph, source, target, Weight.TIME, Algorithm.ASTAR)
            rerouted += 1
            extra_s.append(detour.travel_time_s - usual.travel_time_s)
            extra_m.append(detour.length_m - usual.length_m)
        except NoRouteError:
            cut_off += 1
        finally:
            graph.open_edges(closed)
    return {
        "routes": routed, "rerouted": rerouted, "cut_off": cut_off,
        "extra_time_s_median": statistics.median(extra_s), "extra_time_s_mean": statistics.mean(extra_s),
        "extra_time_s_max": max(extra_s), "extra_length_m_median": statistics.median(extra_m),
        "under_one_minute": sum(s < 60 for s in extra_s), "over_five_minutes": sum(s > 300 for s in extra_s),
    }


def main(argv: list[str] | None = None) -> int:
    """Measure the detours caused by closing one road on each of many random routes."""
    parser = argparse.ArgumentParser(prog="python -m app.routing.evaluate_closures")
    parser.add_argument("--pairs", type=int, default=200)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--json", type=Path, help="write the summary to this JSON file")
    args = parser.parse_args(argv)

    graph = load_graph(get_engine())
    result = evaluate(graph, random_pairs(graph, args.pairs, args.seed))
    print(json.dumps(result, indent=2))
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
