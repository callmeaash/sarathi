from sqlalchemy import Connection, text

# A hazard closes every road segment within this distance: both carriageways of a divided road and any
# parallel bridge at the same crossing, not just the one segment the report snapped to.
DEFAULT_RADIUS_M = 30
MAX_RADIUS_M = 500
METRES_PER_DEGREE = 111_000  # rough; only used for a generous index pre-filter

EDGES_NEAR = text("""
    SELECT id FROM road_edges
    WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), :radius_deg)
      AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :radius_m)
    ORDER BY id
""")


def edges_near(conn: Connection, lon: float, lat: float, radius_m: float = DEFAULT_RADIUS_M) -> list[int]:
    """Ids of all road edges within a radius (metres) of a point, in both directions."""
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        raise ValueError("coordinates out of range")
    if not 0 < radius_m <= MAX_RADIUS_M:
        raise ValueError(f"radius must be between 0 and {MAX_RADIUS_M} m")
    # The first condition uses the spatial index (degrees, deliberately too wide); the second is exact in metres.
    params = {"lon": lon, "lat": lat, "radius_m": radius_m, "radius_deg": 2 * radius_m / METRES_PER_DEGREE}
    return list(conn.execute(EDGES_NEAR, params).scalars())
