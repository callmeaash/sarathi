import json
from dataclasses import dataclass

from sqlalchemy import Connection, text

from app.routing.graph import RoadGraph, haversine_m
from app.routing.search import Route

# Clicks further than this from any road are outside the area we cover.
MAX_SNAP_M = 1000
# Largest map area (degrees) the facility list answers for; roughly the whole valley.
MAX_BBOX_SPAN_DEG = 0.6

SNAP = text("""
    SELECT c.id, ST_Distance(c.geom::geography, p.geom::geography) AS dist
    FROM (SELECT ST_SetSRID(ST_MakePoint(:lon, :lat), 4326) AS geom) p
    CROSS JOIN LATERAL (
        SELECT n.id, n.geom FROM road_nodes n ORDER BY n.geom <-> p.geom LIMIT 8
    ) c
    ORDER BY dist
    LIMIT 1
""")


class SnapError(Exception):
    pass


@dataclass
class Snap:
    node_id: int
    distance_m: float


def check_coordinates(lon: float, lat: float) -> None:
    """Reject coordinates outside the valid range."""
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        raise SnapError("coordinates out of range")


def snap_to_node(conn: Connection, graph: RoadGraph, lon: float, lat: float) -> Snap:
    """Find the nearest road junction to a point, using the spatial index."""
    check_coordinates(lon, lat)
    row = conn.execute(SNAP, {"lon": lon, "lat": lat}).first()
    if row is None or row.dist > MAX_SNAP_M:
        raise SnapError(f"no road within {MAX_SNAP_M} m of this point; Sarathi covers Kathmandu District")
    if row.id not in graph.index:
        raise SnapError("the road network changed since the server started; restart it to reload the map data")
    return Snap(row.id, float(row.dist))


def stitch(lines: list[list[list[float]]], starts: list[tuple[float, float]]) -> list[list[float]]:
    """Join edge lines into one line, flipping any edge drawn against its direction of travel."""
    coords: list[list[float]] = []
    for line, (sx, sy) in zip(lines, starts):
        if not line:
            continue
        first, last = line[0], line[-1]
        if haversine_m(last[0], last[1], sx, sy) < haversine_m(first[0], first[1], sx, sy):
            line = line[::-1]
        if coords and coords[-1] == line[0]:
            line = line[1:]
        coords.extend(line)
    return coords


def route_coordinates(conn: Connection, graph: RoadGraph, route: Route) -> list[list[float]]:
    """Return the route as a list of [lon, lat] positions following the roads."""
    if not route.edge_ids:
        i = graph.node_index(route.node_ids[0])
        return [[graph.lon[i], graph.lat[i]]] * 2  # a GeoJSON line needs two positions
    rows = conn.execute(text("SELECT id, ST_AsGeoJSON(geom) FROM road_edges WHERE id = ANY(:ids)"),
                        {"ids": route.edge_ids}).all()
    geometry = {edge_id: json.loads(geojson)["coordinates"] for edge_id, geojson in rows}
    missing = [e for e in route.edge_ids if e not in geometry]
    if missing:
        raise SnapError("the road network changed since the server started; restart it to reload the map data")
    starts = [(graph.lon[s], graph.lat[s]) for s in (graph.sources[graph.position[e]] for e in route.edge_ids)]
    return stitch([geometry[e] for e in route.edge_ids], starts)


def parse_bbox(bbox: str) -> tuple[float, float, float, float]:
    """Parse 'minLon,minLat,maxLon,maxLat' and check it is a sensible map area."""
    try:
        min_lon, min_lat, max_lon, max_lat = (float(v) for v in bbox.split(","))
    except ValueError:
        raise ValueError("bbox must be four numbers: minLon,minLat,maxLon,maxLat") from None
    if not (-180 <= min_lon < max_lon <= 180 and -90 <= min_lat < max_lat <= 90):
        raise ValueError("bbox corners are out of range or in the wrong order")
    if max_lon - min_lon > MAX_BBOX_SPAN_DEG or max_lat - min_lat > MAX_BBOX_SPAN_DEG:
        raise ValueError(f"bbox is too large; zoom in (max {MAX_BBOX_SPAN_DEG}° each side)")
    return min_lon, min_lat, max_lon, max_lat
