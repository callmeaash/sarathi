from dataclasses import dataclass

from sqlalchemy import Connection, text

from app.routing.points import Coords, PlannedRoute

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
    usual_coords: Coords      # the usual route's line


def route_steps(conn: Connection, legs: list[tuple[int, float, float]]) -> list[RouteStep]:
    """The route as a list of roads in order: consecutive segments of the same road become one step."""
    ids = [edge_id for edge_id, _, _ in legs]
    names = dict(conn.execute(EDGE_NAMES, {"ids": ids}).all()) if ids else {}
    steps: list[RouteStep] = []
    for edge_id, length, seconds in legs:
        name = names.get(edge_id)
        if steps and steps[-1].road_name == name:
            steps[-1].distance_m += length
            steps[-1].duration_s += seconds
        else:
            steps.append(RouteStep(name, length, seconds))
    return steps


def closures_avoided(route: PlannedRoute, usual: PlannedRoute | None,
                     active: dict[int, list[int]]) -> Detour | None:
    """How the route differs from the one people would take if nothing were closed; None if it doesn't."""
    if usual is None or usual.cost >= route.cost - COST_EPSILON:
        return None
    used = set(usual.edge_ids)
    blocking = sorted(incident_id for incident_id, edge_ids in active.items() if used.intersection(edge_ids))
    if not blocking:
        return None  # longer for some other reason, not because of a closure
    return Detour(usual.length_m, usual.time_s, blocking, usual.coords)
