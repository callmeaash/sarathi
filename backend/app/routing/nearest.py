import time
from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import Engine, text

from app.models import FACILITY_KINDS
from app.routing.graph import RoadGraph, haversine_m
from app.routing.search import Algorithm, Route, Search, Weight

# Speed assumed for the short stretch between a facility and its nearest road node (gate, compound, lane).
ACCESS_SPEED_KPH = 10


@dataclass(frozen=True)
class Facility:
    id: int
    kind: str
    name: str | None
    lon: float
    lat: float
    node_id: int
    access_m: float  # distance from the facility to its nearest road node


@dataclass
class FacilityIndex:
    # kind -> internal node index -> facilities attached to that node
    by_kind: dict[str, dict[int, list[Facility]]]
    skipped: int  # facilities whose road node is not in the graph

    def count(self, kind: str) -> int:
        """Number of facilities of a kind in the index."""
        return sum(len(found) for found in self.by_kind.get(kind, {}).values())

    def all(self, kind: str) -> list[Facility]:
        """All facilities of a kind."""
        return [f for found in self.by_kind.get(kind, {}).values() for f in found]


@dataclass
class NearbyFacility:
    facility: Facility
    route: Route            # road route from the start node to the facility's road node
    length_m: float         # route length plus the access distance
    travel_time_s: float    # route time plus the access time
    straight_line_m: float  # straight-line distance from the start to the facility, for comparison


def access_time_s(access_m: float) -> float:
    """Time to cover the access distance between a road node and a facility."""
    return access_m / (ACCESS_SPEED_KPH / 3.6)


def build_facility_index(graph: RoadGraph, facilities: Iterable[Facility]) -> FacilityIndex:
    """Group facilities by kind and by the road node they are attached to."""
    by_kind: dict[str, dict[int, list[Facility]]] = {}
    skipped = 0
    for facility in facilities:
        node = graph.index.get(facility.node_id)
        if node is None:
            skipped += 1
            continue
        by_kind.setdefault(facility.kind, {}).setdefault(node, []).append(facility)
    return FacilityIndex(by_kind, skipped)


def load_facilities(engine: Engine, graph: RoadGraph) -> FacilityIndex:
    """Load facilities that are linked to a road node from PostGIS."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, kind, coalesce(name_en, name, name_ne), ST_X(geom), ST_Y(geom), nearest_node_id,
                   coalesce(snap_distance_m, 0)
            FROM facilities WHERE nearest_node_id IS NOT NULL
        """)).all()
    return build_facility_index(graph, (Facility(*row) for row in rows))


def nearest_facilities(graph: RoadGraph, index: FacilityIndex, source_id: int, kind: str,
                       weight: Weight | str = Weight.TIME, limit: int = 1) -> list[NearbyFacility]:
    """Find the closest facilities of a kind by road, searching outward from one node."""
    weight = Weight(weight)
    if kind not in FACILITY_KINDS:
        raise ValueError(f"unknown facility kind '{kind}'; expected one of {', '.join(FACILITY_KINDS)}")
    if limit < 1:
        raise ValueError("limit must be at least 1")
    source = graph.node_index(source_id)
    at_node = index.by_kind.get(kind, {})
    if not at_node:
        return []

    def total(cost: float, facility: Facility) -> float:
        """Route cost plus the cost of the access stretch."""
        return cost + (facility.access_m if weight is Weight.LENGTH else access_time_s(facility.access_m))

    started = time.perf_counter()
    search = Search(graph, source, weight)
    found: list[tuple[float, Facility, int]] = []
    for node, cost in search.run():
        # Nodes come out in order of cost and access costs are never negative, so once this node's cost
        # reaches the limit-th best total nothing later can beat it.
        if len(found) >= limit and cost >= found[limit - 1][0]:
            break
        here = at_node.get(node)
        if here:
            found.extend((total(cost, facility), facility, node) for facility in here)
            found.sort(key=lambda item: (item[0], item[1].id))

    src_lon, src_lat = graph.lon[source], graph.lat[source]
    results = []
    for _, facility, node in found[:limit]:
        route = search.route_to(node, Algorithm.DIJKSTRA, started)
        results.append(NearbyFacility(
            facility=facility,
            route=route,
            length_m=route.length_m + facility.access_m,
            travel_time_s=route.travel_time_s + access_time_s(facility.access_m),
            straight_line_m=haversine_m(src_lon, src_lat, facility.lon, facility.lat),
        ))
    return results


def straight_line_nearest(index: FacilityIndex, kind: str, lon: float, lat: float) -> Facility | None:
    """Return the facility of a kind closest in a straight line, ignoring roads."""
    candidates = index.all(kind)
    if not candidates:
        return None
    return min(candidates, key=lambda f: (haversine_m(lon, lat, f.lon, f.lat), f.id))
