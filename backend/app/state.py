import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import Engine

from app.routing.graph import RoadGraph, load_graph
from app.routing.nearest import FacilityIndex, load_facilities

log = logging.getLogger(__name__)


@dataclass
class RoutingState:
    graph: RoadGraph
    facilities: FacilityIndex
    loaded_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


def load_routing_state(engine: Engine) -> RoutingState:
    """Load the road graph and facilities into memory once, at startup."""
    started = time.perf_counter()
    graph = load_graph(engine)
    facilities = load_facilities(engine, graph)
    log.info("loaded %d nodes, %d edges and facilities in %.1f s",
             graph.node_count, graph.edge_count, time.perf_counter() - started)
    return RoutingState(graph, facilities)
