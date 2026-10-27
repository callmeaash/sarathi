import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import Connection, Engine, text

from app.routing.closures import edges_near
from app.routing.graph import RoadGraph, load_graph
from app.routing.nearest import FacilityIndex, load_facilities

log = logging.getLogger(__name__)

VERIFIED_INCIDENTS = text("""
    SELECT id, ST_X(geom) AS lon, ST_Y(geom) AS lat, closure_radius_m FROM incidents WHERE status = 'verified'
""")


@dataclass
class RoutingState:
    graph: RoadGraph
    facilities: FacilityIndex
    loaded_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    closures: dict[int, list[int]] = field(default_factory=dict)  # incident id -> edges it closed
    lock: threading.Lock = field(default_factory=threading.Lock)  # requests run in threads; guard closure changes


def apply_closure(state: RoutingState, incident_id: int, edge_ids: list[int]) -> list[int]:
    """Close the given edges for an incident and remember them; returns the edges recorded."""
    with state.lock:
        if incident_id in state.closures:
            return state.closures[incident_id]  # already applied
        known = [e for e in edge_ids if e in state.graph.position]
        state.graph.close_edges(known, both_directions=False)  # edges_near already includes both directions
        state.closures[incident_id] = known
        return known


def lift_closure(state: RoutingState, incident_id: int) -> list[int]:
    """Remove an incident's closure; returns the edges that are open again (others may still be closed)."""
    with state.lock:
        edge_ids = state.closures.pop(incident_id, [])
        return state.graph.open_edges(edge_ids, both_directions=False)


def active_closures(state: RoutingState) -> dict[int, list[int]]:
    """A copy of the current closures (incident id -> closed edges), safe to read while others change them."""
    with state.lock:
        return {incident_id: list(edge_ids) for incident_id, edge_ids in state.closures.items()}


def restore_closures(conn: Connection, state: RoutingState) -> int:
    """Re-apply every verified incident's closure, recomputing its roads from its location."""
    count = 0
    for row in conn.execute(VERIFIED_INCIDENTS):
        apply_closure(state, row.id, edges_near(conn, row.lon, row.lat, row.closure_radius_m))
        count += 1
    return count


def load_routing_state(engine: Engine) -> RoutingState:
    """Load the road graph, facilities and active closures into memory once, at startup."""
    started = time.perf_counter()
    graph = load_graph(engine)
    state = RoutingState(graph, load_facilities(engine, graph))
    with engine.connect() as conn:
        incidents = restore_closures(conn, state)
    log.info("loaded %d nodes, %d edges, facilities and %d active closures in %.1f s",
             graph.node_count, graph.edge_count, incidents, time.perf_counter() - started)
    return state
