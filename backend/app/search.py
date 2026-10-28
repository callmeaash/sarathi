from dataclasses import dataclass

from sqlalchemy import Connection, text

MIN_QUERY_LENGTH = 2

# Must match the index expressions in migration 0004, or the trigram indexes won't be used.
FACILITY_NAMES = "lower(coalesce(f.name, '') || ' ' || coalesce(f.name_en, '') || ' ' || coalesce(f.name_ne, ''))"
ROAD_NAMES = "lower(coalesce(e.name, '') || ' ' || coalesce(e.name_en, ''))"

# Facilities by any of their names, roads grouped by the name shown (one result per road, placed near its middle).
# Matches are an exact substring (LIKE) or a close spelling (word similarity, pg_trgm's <% operator).
# Ranked: name starts with the query, then a word in it does, then it appears anywhere, then spelling matches.
# LIKE patterns use "!" as their escape character (see like_escape).
SEARCH = text(f"""
    WITH hits AS (
        SELECT 'facility' AS type, f.id, coalesce(f.name_en, f.name, f.name_ne) AS name, f.kind, f.address,
               f.geom AS point, {FACILITY_NAMES} AS names
        FROM facilities f
        WHERE {FACILITY_NAMES} LIKE :contains ESCAPE '!' OR :q <% {FACILITY_NAMES}
        UNION ALL
        SELECT 'road', NULL, min(coalesce(e.name_en, e.name)), NULL, NULL,
               ST_ClosestPoint(ST_Collect(e.geom), ST_Centroid(ST_Collect(e.geom))), min({ROAD_NAMES})
        FROM road_edges e
        WHERE ({ROAD_NAMES} LIKE :contains ESCAPE '!' OR :q <% {ROAD_NAMES}) AND coalesce(e.name_en, e.name) <> ''
        GROUP BY lower(coalesce(e.name_en, e.name))
    )
    SELECT type, id, name, kind, address, ST_X(point) AS lon, ST_Y(point) AS lat,
           CASE WHEN CAST(:near_lon AS double precision) IS NULL THEN NULL
                ELSE ST_Distance(point::geography,
                                 ST_SetSRID(ST_MakePoint(:near_lon, :near_lat), 4326)::geography) END AS distance_m
    FROM hits
    ORDER BY CASE WHEN names LIKE :prefix ESCAPE '!' THEN 0
                  WHEN names LIKE :word_prefix ESCAPE '!' THEN 1
                  WHEN names LIKE :contains ESCAPE '!' THEN 2
                  ELSE 3 END,
             word_similarity(:q, names) DESC, distance_m NULLS LAST, length(name), name
    LIMIT :limit
""")


@dataclass(frozen=True)
class SearchHit:
    type: str  # "facility" or "road"
    id: int | None
    name: str
    kind: str | None
    address: str | None
    lon: float
    lat: float
    distance_m: float | None


def like_escape(value: str) -> str:
    """Make LIKE's wildcards (and the "!" escape character itself) match literally."""
    return value.replace("!", "!!").replace("%", "!%").replace("_", "!_")


def search(conn: Connection, query: str, limit: int, near: tuple[float, float] | None = None) -> list[SearchHit]:
    """Facilities and roads whose names match the query, best matches first."""
    q = " ".join(query.lower().split())
    if len(q) < MIN_QUERY_LENGTH:
        raise ValueError(f"type at least {MIN_QUERY_LENGTH} characters")
    escaped = like_escape(q)
    near_lon, near_lat = near if near else (None, None)
    rows = conn.execute(SEARCH, {
        "q": q, "contains": f"%{escaped}%", "prefix": f"{escaped}%", "word_prefix": f"% {escaped}%",
        "near_lon": near_lon, "near_lat": near_lat, "limit": limit,
    })
    return [SearchHit(**row._mapping) for row in rows]
