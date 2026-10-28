from dataclasses import dataclass

from sqlalchemy import Connection, text

from app.routing.graph import RoadGraph
from app.routing.search import Algorithm, NoRouteError, Route, Weight, find_route
from app.state import RoutingState, active_closures

EDGE_NAMES = text("SELECT id, coalesce(name_en, name) AS name FROM road_edges WHERE id = ANY(:ids)")

# Two route costs closer than this are the same route cost (float sums in a different order).
COST_EPSILON = 1e-6


@dataclass
class RouteStep:
    road_name: str | None  # None for unnamed roads
    distance_m: float
    duration_s: float


@dataclass(frozen=True)
class Detour:
    usual_distance_m: float   # the best route if nothing were closed
    usual_duration_s: float
    incident_ids: list[int]   # verified hazards whose closed roads that usual route would use


def route_steps(conn: Connection, graph: RoadGraph, route: Route) -> list[RouteStep]:
    """The route as a list of roads in order: consecutive segments of the same road become one step."""
    names = dict(conn.execute(EDGE_NAMES, {"ids": route.edge_ids}).all()) if route.edge_ids else {}
    steps: list[RouteStep] = []
    for edge_id in route.edge_ids:
        position = graph.edge_position(edge_id)
        name = names.get(edge_id)
        if steps and steps[-1].road_name == name:
            steps[-1].distance_m += graph.length_m[position]
            steps[-1].duration_s += graph.travel_time_s[position]
        else:
            steps.append(RouteStep(name, graph.length_m[position], graph.travel_time_s[position]))
    return steps


def usual_route(state: RoutingState, source_id: int, target_id: int, route: Route) -> Route | None:
    """The same search with every road open, or None when there is no route at all."""
    try:
        return find_route(state.graph, source_id, target_id, route.weight, route.algorithm, ignore_closures=True)
    except NoRouteError:
        return None


def closures_avoided(state: RoutingState, source_id: int, target_id: int, route: Route) -> Detour | None:
    """How the route differs from the one people would take if nothing were closed; None if it doesn't."""
    active = active_closures(state)
    if not active:
        return None  # nothing closed: the route is the usual one, no second search needed
    usual = usual_route(state, source_id, target_id, route)
    if usual is None or usual.cost >= route.cost - COST_EPSILON:
        return None
    used = set(usual.edge_ids)
    blocking = sorted(incident_id for incident_id, edge_ids in active.items() if used.intersection(edge_ids))
    return Detour(usual.length_m, usual.travel_time_s, blocking)


def cut_off_by_closures(state: RoutingState, source_id: int, target_id: int, weight: Weight,
                        algorithm: Algorithm) -> bool:
    """Whether closures are the only reason there is no route between two nodes."""
    if not active_closures(state):
        return False
    try:
        find_route(state.graph, source_id, target_id, weight, algorithm, ignore_closures=True)
        return True
    except NoRouteError:
        return False
