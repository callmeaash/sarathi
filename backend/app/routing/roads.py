from dataclasses import dataclass

from sqlalchemy import Connection, text

# The closest point on the nearest road segment. The KNN pre-filter (<->) uses the spatial index on planar
# distance; the ten candidates are then ranked by true distance in metres.
NEAREST_ROAD = text("""
    SELECT coalesce(e.name_en, e.name) AS road, ST_Distance(e.geom::geography, p.geom::geography) AS dist,
           ST_X(ST_ClosestPoint(e.geom, p.geom)) AS lon, ST_Y(ST_ClosestPoint(e.geom, p.geom)) AS lat
    FROM (SELECT ST_SetSRID(ST_MakePoint(:lon, :lat), 4326) AS geom) p
    CROSS JOIN LATERAL (SELECT name, name_en, geom FROM road_edges ORDER BY geom <-> p.geom LIMIT 10) e
    ORDER BY dist
    LIMIT 1
""")


@dataclass(frozen=True)
class RoadPoint:
    road_name: str | None
    distance_m: float  # from the given point to the road
    lon: float         # closest point on the road
    lat: float


def nearest_road(conn: Connection, lon: float, lat: float) -> RoadPoint | None:
    """The nearest road to a point and the closest spot on it, or None if there are no roads at all."""
    row = conn.execute(NEAREST_ROAD, {"lon": lon, "lat": lat}).first()
    if row is None:
        return None
    return RoadPoint(road_name=row.road, distance_m=float(row.dist), lon=row.lon, lat=row.lat)
