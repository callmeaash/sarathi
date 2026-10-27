from sqlalchemy import Connection, Engine, text
from sqlalchemy.exc import OperationalError

# Tables and columns the pipeline writes to. The schema itself is owned by backend/ (Alembic);
# this is only the part of it the pipeline depends on.
REQUIRED_COLUMNS = {
    "road_nodes": {"id", "geom", "street_count"},
    "road_edges": {"source", "target", "key", "osm_way_id", "name", "name_en", "highway", "oneway", "bridge",
                   "tunnel", "length_m", "speed_kph", "travel_time_s", "geom"},
    "facilities": {"osm_type", "osm_id", "kind", "name", "name_en", "name_ne", "phone", "opening_hours", "address",
                   "emergency", "geom", "nearest_node_id", "snap_distance_m", "source", "updated_at"},
    "import_runs": {"started_at", "finished_at", "status", "area", "snapshot", "nodes", "edges", "facilities",
                    "dropped_nodes", "message"},
}
FIX_HINT = "create or update the tables with: cd backend && ..\\.venv\\Scripts\\python -m alembic upgrade head"


class SchemaError(Exception):
    pass


def find_problems(actual: dict[str, set[str]], has_postgis: bool) -> list[str]:
    problems = [] if has_postgis else ["the PostGIS extension is not installed in this database"]
    for table, columns in REQUIRED_COLUMNS.items():
        if table not in actual:
            problems.append(f"table {table} is missing")
        elif missing := sorted(columns - actual[table]):
            problems.append(f"table {table} is missing columns: {', '.join(missing)}")
    return problems


def read_schema(conn: Connection) -> tuple[dict[str, set[str]], bool]:
    rows = conn.execute(text("""
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = ANY(:tables)
    """), {"tables": list(REQUIRED_COLUMNS)}).all()
    has_postgis = conn.execute(text("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis')")).scalar()
    actual: dict[str, set[str]] = {}
    for table, column in rows:
        actual.setdefault(table, set()).add(column)
    return actual, bool(has_postgis)


def check_schema(engine: Engine) -> None:
    try:
        with engine.connect() as conn:
            actual, has_postgis = read_schema(conn)
    except OperationalError as exc:
        raise SchemaError(f"cannot connect to the database ({exc.orig}); check DATABASE_URL in backend/.env") from exc
    problems = find_problems(actual, has_postgis)
    if problems:
        raise SchemaError("; ".join(problems) + f". {FIX_HINT}")
