import heapq
import math
import time
from dataclasses import dataclass
from enum import Enum

from app.routing.graph import RoadGraph, haversine_m

# Shrinks the A* estimate by one part in a million so floating-point rounding can never make it overestimate.
HEURISTIC_SAFETY = 1 - 1e-6


class Weight(str, Enum):
    LENGTH = "length"  # shortest
    TIME = "time"      # fastest


class Algorithm(str, Enum):
    DIJKSTRA = "dijkstra"
    ASTAR = "astar"


class NoRouteError(Exception):
    pass


@dataclass
class Route:
    node_ids: list[int]
    edge_ids: list[int]
    length_m: float
    travel_time_s: float
    cost: float
    weight: Weight
    algorithm: Algorithm
    visited_nodes: int
    runtime_ms: float


def heuristic_scale(graph: RoadGraph, weight: Weight) -> float:
    """Factor turning straight-line metres into a lower bound on the remaining cost (0 disables A* guidance)."""
    if weight is Weight.LENGTH:
        return HEURISTIC_SAFETY
    if graph.max_speed_mps <= 0:
        return 0.0
    return HEURISTIC_SAFETY / graph.max_speed_mps


def find_route(graph: RoadGraph, source_id: int, target_id: int,
               weight: Weight | str = Weight.TIME, algorithm: Algorithm | str = Algorithm.DIJKSTRA) -> Route:
    """Find the cheapest route between two OSM nodes with Dijkstra or A*."""
    weight, algorithm = Weight(weight), Algorithm(algorithm)
    source, target = graph.node_index(source_id), graph.node_index(target_id)
    costs = graph.length_m if weight is Weight.LENGTH else graph.travel_time_s
    offsets, targets = graph.offsets, graph.targets
    started = time.perf_counter()

    n = graph.node_count
    dist = [math.inf] * n
    prev_edge = [-1] * n  # position of the edge used to reach each node
    prev_node = [-1] * n
    settled = bytearray(n)

    scale = heuristic_scale(graph, weight) if algorithm is Algorithm.ASTAR else 0.0
    goal_lon, goal_lat = graph.lon[target], graph.lat[target]
    estimate = [-1.0] * n if scale else None

    def h(i: int) -> float:
        """Lower bound on the cost from node i to the target (0 for Dijkstra)."""
        if not scale:
            return 0.0
        if estimate[i] < 0:
            estimate[i] = haversine_m(graph.lon[i], graph.lat[i], goal_lon, goal_lat) * scale
        return estimate[i]

    dist[source] = 0.0
    heap = [(h(source), 0.0, source)]
    visited = 0
    while heap:
        _, g, u = heapq.heappop(heap)
        if settled[u]:
            continue  # stale entry: u was already reached more cheaply
        settled[u] = 1
        visited += 1
        if u == target:
            break
        for pos in range(offsets[u], offsets[u + 1]):
            v = targets[pos]
            if settled[v]:
                continue
            candidate = g + costs[pos]
            if candidate < dist[v]:
                dist[v] = candidate
                prev_edge[v] = pos
                prev_node[v] = u
                heapq.heappush(heap, (candidate + h(v), candidate, v))

    if not settled[target]:
        raise NoRouteError(f"no route from node {source_id} to node {target_id}")

    positions = []
    node = target
    while node != source:
        positions.append(prev_edge[node])
        node = prev_node[node]
    positions.reverse()

    return Route(
        node_ids=[source_id] + [graph.node_ids[targets[p]] for p in positions],
        edge_ids=[graph.edge_ids[p] for p in positions],
        length_m=sum(graph.length_m[p] for p in positions),
        travel_time_s=sum(graph.travel_time_s[p] for p in positions),
        cost=dist[target],
        weight=weight,
        algorithm=algorithm,
        visited_nodes=visited,
        runtime_ms=(time.perf_counter() - started) * 1000,
    )
