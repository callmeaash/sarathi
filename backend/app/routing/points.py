import json
import math
import time
from dataclasses import dataclass, field

from sqlalchemy import Connection, text

from app.routing.geo import MAX_SNAP_M, SnapError, check_coordinates, route_coordinates
from app.routing.graph import RoadGraph, haversine_m
from app.routing.search import Algorithm, NoRouteError, Search, Weight, heuristic_scale

# The road segment nearest a point, where along it the closest spot is (0 at the line's first vertex, 1 at its last),
# and its shape. The KNN pre-filter uses the spatial index; candidates are then ranked by true distance in metres.
NEAREST_SEGMENT = text("""
    SELECT e.id, ST_Distance(e.geom::geography, p.geom::geography) AS dist,
           ST_LineLocatePoint(e.geom, p.geom) AS frac, ST_AsGeoJSON(e.geom) AS line
    FROM (SELECT ST_SetSRID(ST_MakePoint(:lon, :lat), 4326) AS geom) p
    CROSS JOIN LATERAL (SELECT id, geom FROM road_edges ORDER BY geom <-> p.geom LIMIT 10) e
    ORDER BY dist
    LIMIT 1
""")

Coords = list[list[float]]

# A spot this close to a junction counts as at it, so the route may leave or arrive by any road there.
AT_JUNCTION_M = 1.0


@dataclass(frozen=True)
class RoadPoint:
    """The spot on a road closest to a point someone chose."""
    lon: float
    lat: float
    distance_m: float  # from the chosen point to the road
    position: int      # graph position of the segment, oriented from its source node u to its target node v
    fraction: float    # where the spot is along the segment's line, 0 at u and 1 at v (by drawn length)
    share: float       # the part of the segment's length between u and the spot (0..1, by metres)
    coords: Coords     # the segment's line from u to v
    before: Coords     # u .. spot
    after: Coords      # spot .. v


@dataclass(frozen=True)
class Access:
    """A partial segment between a road point and a junction: how a route leaves its start or reaches its end."""
    node: int          # junction (graph node index)
    cost: float        # in the route's weight
    length_m: float
    time_s: float
    line: Coords       # in the direction of travel
    edge_id: int       # the segment it runs along (for road names and closures)


@dataclass
class PlannedRoute:
    length_m: float
    time_s: float
    cost: float
    weight: Weight
    algorithm: Algorithm
    visited_nodes: int
    runtime_ms: float
    start: RoadPoint
    end: RoadPoint
    legs: list[tuple[int, float, float]]  # (edge id, metres, seconds) in travel order, partial ends included
    coords: Coords = field(default_factory=list)

    @property
    def edge_ids(self) -> list[int]:
        """Every segment the route uses, in order."""
        return [edge_id for edge_id, _, _ in self.legs]


def line_length_m(coords: Coords) -> float:
    """Length of a [lon, lat] line in metres."""
    return sum(haversine_m(a[0], a[1], b[0], b[1]) for a, b in zip(coords, coords[1:]))


def split_line(coords: Coords, fraction: float) -> tuple[Coords, Coords]:
    """Cut a line at a fraction of its drawn length (as PostGIS measures it); both halves include the cut point."""
    if len(coords) < 2:
        return [coords[0]], [coords[0]]
    segments = [math.dist(a, b) for a, b in zip(coords, coords[1:])]
    target = min(max(fraction, 0.0), 1.0) * sum(segments)
    walked = 0.0
    for i, size in enumerate(segments):
        if walked + size >= target or i == len(segments) - 1:
            t = 0.0 if size == 0 else min(max((target - walked) / size, 0.0), 1.0)
            a, b = coords[i], coords[i + 1]
            cut = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
            return coords[:i + 1] + [cut], [cut] + coords[i + 1:]
        walked += size
    return coords, [coords[-1]]  # not reached


def locate_on_road(conn: Connection, graph: RoadGraph, lon: float, lat: float) -> RoadPoint:
    """The spot on the nearest road segment to a point."""
    check_coordinates(lon, lat)
    row = conn.execute(NEAREST_SEGMENT, {"lon": lon, "lat": lat}).first()
    if row is None or row.dist > MAX_SNAP_M:
        raise SnapError(f"no road within {MAX_SNAP_M} m of this point; Sarathi covers Kathmandu District")
    position = graph.position.get(row.id)
    if position is None:
        raise SnapError("the road network changed since the server started; restart it to reload the map data")
    reverse = graph.reverse_positions(position)
    if reverse and reverse[0] < position:  # both directions of a road give the same point: use one of them
        position = reverse[0]
    coords, fraction = json.loads(row.line)["coordinates"], float(row.frac)
    u = graph.sources[position]
    first, last = coords[0], coords[-1]
    from_u = haversine_m(first[0], first[1], graph.lon[u], graph.lat[u])
    if haversine_m(last[0], last[1], graph.lon[u], graph.lat[u]) < from_u:
        coords, fraction = coords[::-1], 1 - fraction  # the line was drawn from v to u
    before, after = split_line(coords, fraction)
    measured = line_length_m(before) + line_length_m(after)
    share = line_length_m(before) / measured if measured > 0 else 0.0
    return RoadPoint(after[0][0], after[0][1], float(row.dist), position, fraction, share, coords, before, after)


def _costs(graph: RoadGraph, weight: Weight) -> list[float]:
    """The per-segment cost list for a weight."""
    return graph.length_m if weight is Weight.LENGTH else graph.travel_time_s


def _open(graph: RoadGraph, position: int, ignore_closures: bool, blocked: frozenset[int] = frozenset()) -> bool:
    """Whether a segment can be used."""
    return position not in blocked and (ignore_closures or graph.closures[position] == 0)


def _access(graph: RoadGraph, position: int, part: float, node: int, line: Coords, costs: list[float]) -> Access:
    """A part (0..1) of a segment, ending or starting at a junction."""
    return Access(node, part * costs[position], part * graph.length_m[position], part * graph.travel_time_s[position],
                  line, graph.edge_ids[position])


def _at_junctions(graph: RoadGraph, point: RoadPoint) -> list[Access]:
    """Free access to a junction the point is standing on, so any road from it can be used."""
    p, length = point.position, graph.length_m[point.position]
    here = [point.before[-1]] * 2
    edge = graph.edge_ids[p]
    out = []
    if point.share * length <= AT_JUNCTION_M:
        out.append(Access(graph.sources[p], 0.0, 0.0, 0.0, here, edge))
    if (1 - point.share) * length <= AT_JUNCTION_M:
        out.append(Access(graph.targets[p], 0.0, 0.0, 0.0, here, edge))
    return out


def leaving(graph: RoadGraph, point: RoadPoint, weight: Weight, ignore_closures: bool = False,
            blocked: frozenset[int] = frozenset()) -> list[Access]:
    """Ways to drive from a road point to a junction: towards v, and towards u if the road is two-way."""
    costs, p, out = _costs(graph, weight), point.position, _at_junctions(graph, point)
    if _open(graph, p, ignore_closures, blocked):
        out.append(_access(graph, p, 1 - point.share, graph.targets[p], point.after, costs))
    for q in graph.reverse_positions(p):
        if _open(graph, q, ignore_closures, blocked):
            out.append(_access(graph, q, point.share, graph.sources[p], point.before[::-1], costs))
            break
    return out


def arriving(graph: RoadGraph, point: RoadPoint, weight: Weight, ignore_closures: bool = False,
             blocked: frozenset[int] = frozenset()) -> list[Access]:
    """Ways to drive from a junction to a road point: from u, and from v if the road is two-way."""
    costs, p, out = _costs(graph, weight), point.position, _at_junctions(graph, point)
    if _open(graph, p, ignore_closures, blocked):
        out.append(_access(graph, p, point.share, graph.sources[p], point.before, costs))
    for q in graph.reverse_positions(p):
        if _open(graph, q, ignore_closures, blocked):
            out.append(_access(graph, q, 1 - point.share, graph.targets[p], point.after[::-1], costs))
            break
    return out


def _along_segment(graph: RoadGraph, start: RoadPoint, end: RoadPoint, weight: Weight,
                   ignore_closures: bool, blocked: frozenset[int]) -> PlannedRoute | None:
    """A route that stays on one segment, when start and end are on the same road and its direction allows it."""
    if start.position != end.position:
        return None
    costs, p = _costs(graph, weight), start.position
    a, b = sorted((start.fraction, end.fraction))
    piece = split_line(split_line(start.coords, b)[0], a / b if b > 0 else 0.0)[1]  # the line between the two spots
    part = abs(end.share - start.share)
    if end.share >= start.share and _open(graph, p, ignore_closures, blocked):
        position, line = p, piece
    else:
        reverse = [q for q in graph.reverse_positions(p) if _open(graph, q, ignore_closures, blocked)]
        if end.share > start.share or not reverse:
            return None
        position, line = reverse[0], piece[::-1]
    length, seconds = part * graph.length_m[position], part * graph.travel_time_s[position]
    legs = [(graph.edge_ids[position], length, seconds)] if length > 0 else []
    return PlannedRoute(length, seconds, part * costs[position], weight, Algorithm.DIJKSTRA, 0, 0.0, start, end,
                        legs, line if len(line) > 1 else line * 2)


def _join(*lines: Coords) -> Coords:
    """Join lines end to end, dropping a repeated point where they meet."""
    out: Coords = []
    for line in lines:
        for point in line:
            if not out or out[-1] != point:
                out.append(point)
    return out if len(out) > 1 else out * 2  # a drawable line needs two positions


def plan_route(conn: Connection | None, graph: RoadGraph, start: RoadPoint, end: RoadPoint, weight: Weight | str,
               algorithm: Algorithm | str, ignore_closures: bool = False,
               blocked: frozenset[int] = frozenset()) -> PlannedRoute:
    """The cheapest route between two road points avoiding `blocked` segments; with a connection, its line too."""
    weight, algorithm = Weight(weight), Algorithm(algorithm)
    started = time.perf_counter()
    starts = leaving(graph, start, weight, ignore_closures, blocked)
    ends = {}
    for access in arriving(graph, end, weight, ignore_closures, blocked):
        if access.node not in ends or access.cost < ends[access.node].cost:
            ends[access.node] = access
    direct = _along_segment(graph, start, end, weight, ignore_closures, blocked)

    best_cost, best_node, route = (direct.cost if direct else math.inf), None, None
    if starts and ends:
        scale = heuristic_scale(graph, weight) if algorithm is Algorithm.ASTAR else 0.0
        heuristic = (lambda i: haversine_m(graph.lon[i], graph.lat[i], end.lon, end.lat) * scale) if scale else None
        search = Search(graph, starts[0].node, weight, heuristic, ignore_closures,
                        starts=[(access.node, access.cost) for access in starts], blocked=blocked)
        estimate = search.heuristic
        for node, cost in search.run():
            if cost + estimate(node) >= best_cost:
                break  # nothing still unsettled can beat the best route found
            if node in ends and cost + ends[node].cost < best_cost:
                best_cost, best_node = cost + ends[node].cost, node
        if best_node is not None:
            route = search.route_to(best_node, algorithm, started)

    if route is None:
        if direct is None:
            raise NoRouteError("no open route between these points")
        direct.algorithm, direct.runtime_ms = algorithm, (time.perf_counter() - started) * 1000
        return direct

    first = min((a for a in starts if a.node == graph.node_index(route.node_ids[0])), key=lambda a: a.cost)
    last = ends[best_node]
    legs = [(first.edge_id, first.length_m, first.time_s)]
    legs += [(e, graph.length_m[graph.position[e]], graph.travel_time_s[graph.position[e]]) for e in route.edge_ids]
    legs.append((last.edge_id, last.length_m, last.time_s))
    legs = [leg for leg in legs if leg[1] > 0]
    planned = PlannedRoute(
        length_m=first.length_m + route.length_m + last.length_m,
        time_s=first.time_s + route.travel_time_s + last.time_s,
        cost=best_cost, weight=weight, algorithm=algorithm, visited_nodes=route.visited_nodes,
        runtime_ms=(time.perf_counter() - started) * 1000, start=start, end=end, legs=legs,
    )
    if conn is not None:
        middle = route_coordinates(conn, graph, route) if route.edge_ids else []
        planned.coords = _join(first.line, middle, last.line)
    return planned
