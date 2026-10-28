from sqlalchemy import Connection, text

from app.routing.closures import DEFAULT_RADIUS_M, METRES_PER_DEGREE
from app.routing.graph import RoadGraph

# Road segments near each report still waiting for review, using the same radius a verified closure would.
NEAR_PENDING = text("""
    SELECT i.id AS incident_id, e.id AS edge_id
    FROM incidents i
    JOIN road_edges e ON ST_DWithin(e.geom, i.geom, :radius_deg)
                     AND ST_DWithin(e.geom::geography, i.geom::geography, :radius_m)
    WHERE i.status = 'pending'
""")

PENDING_DETAILS = text("""
    SELECT id, kind, road_name, created_at FROM incidents WHERE id = ANY(:ids) ORDER BY created_at DESC
""")


def pending_edges(conn: Connection) -> dict[int, set[int]]:
    """Unverified report id -> ids of the road segments around it."""
    near: dict[int, set[int]] = {}
    params = {"radius_m": DEFAULT_RADIUS_M, "radius_deg": 2 * DEFAULT_RADIUS_M / METRES_PER_DEGREE}
    for incident_id, edge_id in conn.execute(NEAR_PENDING, params):
        near.setdefault(incident_id, set()).add(edge_id)
    return near


def blocked_positions(graph: RoadGraph, near: dict[int, set[int]]) -> frozenset[int]:
    """Graph positions of every segment near an unverified report, to avoid them in one search."""
    return frozenset(graph.position[e] for edges in near.values() for e in edges if e in graph.position)


def reports_on(edge_ids: list[int], near: dict[int, set[int]]) -> list[int]:
    """The unverified reports whose roads a route uses."""
    used = set(edge_ids)
    return [incident_id for incident_id, edges in near.items() if used & edges]
