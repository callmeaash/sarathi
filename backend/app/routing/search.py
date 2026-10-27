import heapq
import math
import time
from collections.abc import Callable, Iterator
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


class Search:
    """Best-first search from one node that settles nodes in order of cost (Dijkstra, or A* with a heuristic)."""

    def __init__(self, graph: RoadGraph, source: int, weight: Weight,
                 heuristic: Callable[[int], float] | None = None):
        """Prepare a search from an internal node index."""
        self.graph = graph
        self.source = source
        self.costs = graph.length_m if weight is Weight.LENGTH else graph.travel_time_s
        self.heuristic = heuristic or (lambda i: 0.0)
        n = graph.node_count
        self.dist = [math.inf] * n
        self.prev_edge = [-1] * n  # position of the edge used to reach each node
        self.prev_node = [-1] * n
        self.settled = bytearray(n)
        self.visited = 0

    def run(self) -> Iterator[tuple[int, float]]:
        """Yield (node index, cost) for each node as it is settled, cheapest first."""
        offsets, targets, costs, h = self.graph.offsets, self.graph.targets, self.costs, self.heuristic
        closures = self.graph.closures
        dist, settled = self.dist, self.settled
        dist[self.source] = 0.0
        heap = [(h(self.source), 0.0, self.source)]
        while heap:
            _, g, u = heapq.heappop(heap)
            if settled[u]:
                continue  # stale entry: u was already reached more cheaply
            settled[u] = 1
            self.visited += 1
            yield u, g
            for pos in range(offsets[u], offsets[u + 1]):
                v = targets[pos]
                if settled[v] or closures[pos]:
                    continue
                candidate = g + costs[pos]
                if candidate < dist[v]:
                    dist[v] = candidate
                    self.prev_edge[v] = pos
                    self.prev_node[v] = u
                    heapq.heappush(heap, (candidate + h(v), candidate, v))

    def route_to(self, node: int, algorithm: Algorithm, started: float) -> Route:
        """Build the route from the source to a settled node."""
        if not self.settled[node]:
            raise NoRouteError("node has not been reached")
        positions = []
        current = node
        while current != self.source:
            positions.append(self.prev_edge[current])
            current = self.prev_node[current]
        positions.reverse()
        graph = self.graph
        return Route(
            node_ids=[graph.node_ids[self.source]] + [graph.node_ids[graph.targets[p]] for p in positions],
            edge_ids=[graph.edge_ids[p] for p in positions],
            length_m=sum(graph.length_m[p] for p in positions),
            travel_time_s=sum(graph.travel_time_s[p] for p in positions),
            cost=self.dist[node],
            weight=Weight.LENGTH if self.costs is graph.length_m else Weight.TIME,
            algorithm=algorithm,
            visited_nodes=self.visited,
            runtime_ms=(time.perf_counter() - started) * 1000,
        )


def heuristic_scale(graph: RoadGraph, weight: Weight) -> float:
    """Factor turning straight-line metres into a lower bound on the remaining cost (0 disables A* guidance)."""
    if weight is Weight.LENGTH:
        return HEURISTIC_SAFETY
    if graph.max_speed_mps <= 0:
        return 0.0
    return HEURISTIC_SAFETY / graph.max_speed_mps


def straight_line_heuristic(graph: RoadGraph, target: int, weight: Weight) -> Callable[[int], float] | None:
    """Return a cached A* estimate of the cost from any node to the target, or None if it would always be 0."""
    scale = heuristic_scale(graph, weight)
    if not scale:
        return None
    goal_lon, goal_lat = graph.lon[target], graph.lat[target]
    cache: dict[int, float] = {}

    def h(i: int) -> float:
        """Lower bound on the cost from node i to the target."""
        if i not in cache:
            cache[i] = haversine_m(graph.lon[i], graph.lat[i], goal_lon, goal_lat) * scale
        return cache[i]
    return h


def find_route(graph: RoadGraph, source_id: int, target_id: int,
               weight: Weight | str = Weight.TIME, algorithm: Algorithm | str = Algorithm.DIJKSTRA) -> Route:
    """Find the cheapest route between two OSM nodes with Dijkstra or A*."""
    weight, algorithm = Weight(weight), Algorithm(algorithm)
    source, target = graph.node_index(source_id), graph.node_index(target_id)
    started = time.perf_counter()
    heuristic = straight_line_heuristic(graph, target, weight) if algorithm is Algorithm.ASTAR else None
    search = Search(graph, source, weight, heuristic)
    for node, _ in search.run():
        if node == target:
            return search.route_to(target, algorithm, started)
    raise NoRouteError(f"no route from node {source_id} to node {target_id}")
