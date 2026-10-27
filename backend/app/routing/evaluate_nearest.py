import argparse
import random
import statistics
import sys
from dataclasses import dataclass

from app.db import get_engine
from app.models import FACILITY_KINDS
from app.routing.graph import RoadGraph, load_graph
from app.routing.nearest import FacilityIndex, access_time_s, load_facilities, nearest_facilities, straight_line_nearest
from app.routing.search import NoRouteError, Weight, find_route


@dataclass
class Comparison:
    source_id: int
    road_nearest_id: int
    straight_nearest_id: int
    road_time_s: float
    straight_choice_time_s: float  # time by road to the facility that is nearest in a straight line

    @property
    def differs(self) -> bool:
        """True if the straight-line nearest is not the road nearest."""
        return self.road_nearest_id != self.straight_nearest_id

    @property
    def extra_time_s(self) -> float:
        """Extra travel time from going to the straight-line nearest instead."""
        return self.straight_choice_time_s - self.road_time_s


def compare_point(graph: RoadGraph, index: FacilityIndex, source_id: int, kind: str) -> Comparison | None:
    """Compare the road-nearest and straight-line-nearest facility from one start node."""
    nearest = nearest_facilities(graph, index, source_id, kind, Weight.TIME)
    source = graph.node_index(source_id)
    straight = straight_line_nearest(index, kind, graph.lon[source], graph.lat[source])
    if not nearest or straight is None:
        return None
    road = nearest[0]
    if straight.id == road.facility.id:
        straight_time = road.travel_time_s
    else:
        try:
            route = find_route(graph, source_id, straight.node_id, Weight.TIME)
        except NoRouteError:
            return None
        straight_time = route.travel_time_s + access_time_s(straight.access_m)
    return Comparison(source_id, road.facility.id, straight.id, road.travel_time_s, straight_time)


def evaluate(graph: RoadGraph, index: FacilityIndex, kind: str, points: int, seed: int) -> list[Comparison]:
    """Run the comparison from reproducible random start nodes."""
    rng = random.Random(seed)
    starts = rng.sample(graph.node_ids, min(points, graph.node_count))
    return [c for c in (compare_point(graph, index, s, kind) for s in starts) if c is not None]


def summarise(kind: str, results: list[Comparison]) -> str:
    """One line: how often the two answers differ and how much time the straight-line choice costs."""
    if not results:
        return f"{kind:13} no results"
    differ = [r for r in results if r.differs]
    extra = sorted(r.extra_time_s / 60 for r in differ)
    detail = (f"median extra {statistics.median(extra):.1f} min, worst {extra[-1]:.1f} min" if extra else "")
    return f"{kind:13} {len(results):>6} {len(differ):>8} {100 * len(differ) / len(results):>7.1f}%  {detail}"


def main(argv: list[str] | None = None) -> int:
    """Measure how often the straight-line nearest facility is not the nearest by road."""
    parser = argparse.ArgumentParser(prog="python -m app.routing.evaluate_nearest")
    parser.add_argument("--points", type=int, default=500, help="random start points")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--kind", choices=FACILITY_KINDS, action="append", help="repeat for several (default: all)")
    args = parser.parse_args(argv)
    if args.points < 1:
        parser.error("--points must be at least 1")

    engine = get_engine()
    graph = load_graph(engine)
    index = load_facilities(engine, graph)
    print(f"{graph.node_count:,} road nodes; facilities skipped (not on the network): {index.skipped}\n")
    print(f"{'kind':13} {'points':>6} {'differ':>8} {'share':>8}  when they differ")
    for kind in args.kind or FACILITY_KINDS:
        if index.count(kind) == 0:
            print(f"{kind:13} no facilities")
            continue
        print(summarise(kind, evaluate(graph, index, kind, args.points, args.seed)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
