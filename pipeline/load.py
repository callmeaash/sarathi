import logging
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy import Connection, Engine, text

from pipeline.transform import Transformed

log = logging.getLogger(__name__)

STAGING_TABLES = [
    """CREATE TEMP TABLE stage_nodes (
        id bigint, geom geometry(Point, 4326), street_count smallint
    ) ON COMMIT DROP""",
    """CREATE TEMP TABLE stage_edges (
        source bigint, target bigint, key smallint, osm_way_id bigint, name text, name_en text,
        highway text, oneway boolean, bridge boolean, tunnel boolean,
        length_m double precision, speed_kph double precision, travel_time_s double precision,
        geom geometry(LineString, 4326)
    ) ON COMMIT DROP""",
    """CREATE TEMP TABLE stage_facilities (
        osm_type text, osm_id bigint, kind text, name text, name_en text, name_ne text, phone text,
        opening_hours text, address text, emergency boolean, geom geometry(Point, 4326)
    ) ON COMMIT DROP""",
]

FACILITY_FIELDS = "kind, name, name_en, name_ne, phone, opening_hours, address, emergency, geom"

SWAP_STATEMENTS = [
    "UPDATE facilities SET nearest_node_id = NULL, snap_distance_m = NULL",
    "DELETE FROM road_edges",
    "DELETE FROM road_nodes",
    "INSERT INTO road_nodes (id, geom, street_count) SELECT id, geom, street_count FROM stage_nodes",
    """INSERT INTO road_edges (source, target, key, osm_way_id, name, name_en, highway, oneway, bridge, tunnel,
                               length_m, speed_kph, travel_time_s, geom)
       SELECT source, target, key, osm_way_id, name, name_en, highway, oneway, bridge, tunnel,
              length_m, speed_kph, travel_time_s, geom
       FROM stage_edges""",
    # Rows edited by moderators (source = 'manual') are never overwritten or deleted.
    f"""INSERT INTO facilities (osm_type, osm_id, {FACILITY_FIELDS}, source)
        SELECT osm_type, osm_id, {FACILITY_FIELDS}, 'osm' FROM stage_facilities
        ON CONFLICT (osm_type, osm_id) DO UPDATE SET
            kind = EXCLUDED.kind, name = EXCLUDED.name, name_en = EXCLUDED.name_en, name_ne = EXCLUDED.name_ne,
            phone = EXCLUDED.phone, opening_hours = EXCLUDED.opening_hours, address = EXCLUDED.address,
            emergency = EXCLUDED.emergency, geom = EXCLUDED.geom, updated_at = now()
        WHERE facilities.source = 'osm'""",
    """DELETE FROM facilities f
       WHERE f.source = 'osm'
         AND NOT EXISTS (SELECT 1 FROM stage_facilities s WHERE s.osm_type = f.osm_type AND s.osm_id = f.osm_id)""",
    # Nearest road node: the GiST index finds a few candidates by planar distance (<->),
    # then the true distance in metres picks the closest one.
    """UPDATE facilities f SET nearest_node_id = nn.id, snap_distance_m = nn.dist
       FROM facilities f2
       CROSS JOIN LATERAL (
           SELECT c.id, ST_Distance(c.geom::geography, f2.geom::geography) AS dist
           FROM (SELECT n.id, n.geom FROM road_nodes n ORDER BY n.geom <-> f2.geom LIMIT 8) c
           ORDER BY dist
           LIMIT 1
       ) nn
       WHERE f.id = f2.id""",
]

RECORD_RUN = text("""
    INSERT INTO import_runs (started_at, finished_at, status, area, snapshot, nodes, edges, facilities,
                             dropped_nodes, message)
    VALUES (:started_at, now(), :status, :area, :snapshot, :nodes, :edges, :facilities, :dropped_nodes, :message)
""")


def _value(v):
    if v is None or (not isinstance(v, str) and pd.isna(v)):
        return None
    return v.item() if hasattr(v, "item") else v  # numpy scalars -> plain Python for psycopg


def _copy(conn: Connection, table: str, columns: list[str], rows) -> None:
    cursor = conn.connection.driver_connection.cursor()
    with cursor.copy(f"COPY {table} ({', '.join(columns)}) FROM STDIN") as copy:
        for row in rows:
            copy.write_row(row)


def stage(conn: Connection, data: Transformed) -> None:
    for ddl in STAGING_TABLES:
        conn.exec_driver_sql(ddl)
    _copy(conn, "stage_nodes", ["id", "geom", "street_count"], (
        (int(r.id), f"SRID=4326;POINT({r.lon} {r.lat})", _value(r.street_count))
        for r in data.nodes.itertuples(index=False)
    ))
    edge_columns = ["source", "target", "key", "osm_way_id", "name", "name_en", "highway", "oneway", "bridge",
                    "tunnel", "length_m", "speed_kph", "travel_time_s"]
    _copy(conn, "stage_edges", [*edge_columns, "geom"], (
        (*(_value(getattr(r, c)) for c in edge_columns), f"SRID=4326;{r.wkt}")
        for r in data.edges.itertuples(index=False)
    ))
    fac = data.facilities
    fac_columns = ["osm_type", "osm_id", "kind", "name", "name_en", "name_ne", "phone", "opening_hours",
                   "address", "emergency"]
    _copy(conn, "stage_facilities", [*fac_columns, "geom"], (
        (*(_value(row[c]) for c in fac_columns), f"SRID=4326;{geom.wkt}")
        for (_, row), geom in zip(fac.iterrows(), fac.geometry)
    ))


def swap(conn: Connection) -> None:
    for statement in SWAP_STATEMENTS:
        conn.exec_driver_sql(statement)


def counts(conn: Connection) -> dict[str, int]:
    return {
        table: conn.execute(text(f"SELECT count(*) FROM {table}")).scalar_one()
        for table in ("road_nodes", "road_edges", "facilities")
    }


def run_import(engine: Engine, data: Transformed, area: str, snapshot: str | None,
               started_at: datetime | None = None) -> dict[str, int]:
    started_at = started_at or datetime.now(timezone.utc)
    try:
        with engine.begin() as conn:
            stage(conn, data)
            swap(conn)
            result = counts(conn)
            conn.execute(RECORD_RUN, dict(
                started_at=started_at, status="succeeded", area=area, snapshot=snapshot,
                nodes=result["road_nodes"], edges=result["road_edges"], facilities=result["facilities"],
                dropped_nodes=data.dropped_nodes, message=None,
            ))
        return result
    except Exception as exc:
        log.error("import failed, the previous data was kept: %s", exc)
        with engine.begin() as conn:
            conn.execute(RECORD_RUN, dict(
                started_at=started_at, status="failed", area=area, snapshot=snapshot,
                nodes=None, edges=None, facilities=None, dropped_nodes=data.dropped_nodes,
                message=str(exc)[:2000],
            ))
        raise
