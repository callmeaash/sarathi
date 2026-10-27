import pytest
from sqlalchemy import create_engine, text

from pipeline.__main__ import main
from pipeline.schema import REQUIRED_COLUMNS, SchemaError, check_schema, find_problems, read_schema
from pipeline.tests.conftest import needs_db


def full_schema() -> dict[str, set[str]]:
    return {table: set(columns) | {"id"} for table, columns in REQUIRED_COLUMNS.items()}


def test_complete_schema_has_no_problems():
    assert find_problems(full_schema(), has_postgis=True) == []


def test_extra_tables_and_columns_are_fine():
    actual = full_schema()
    actual["road_edges"].add("lanes")
    actual["users"] = {"id", "email"}
    assert find_problems(actual, has_postgis=True) == []


def test_missing_table():
    actual = full_schema()
    del actual["facilities"]
    assert find_problems(actual, has_postgis=True) == ["table facilities is missing"]


def test_missing_columns_are_listed():
    actual = full_schema()
    actual["road_edges"] -= {"speed_kph", "bridge"}
    assert find_problems(actual, has_postgis=True) == ["table road_edges is missing columns: bridge, speed_kph"]


def test_empty_database_reports_everything():
    problems = find_problems({}, has_postgis=False)
    assert problems[0].startswith("the PostGIS extension")
    assert len(problems) == 1 + len(REQUIRED_COLUMNS)


def test_unreachable_database_gives_a_clear_error():
    engine = create_engine("postgresql+psycopg://nobody:nothing@127.0.0.1:1/none")
    with pytest.raises(SchemaError, match="cannot connect"):
        check_schema(engine)


def test_cli_stops_before_downloading_without_database_url(monkeypatch, caplog):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("PIPELINE_DATABASE_URL", raising=False)
    monkeypatch.setattr("pipeline.__main__.area_polygon", lambda *a: pytest.fail("should not download"))
    assert main(["--area", "teku"]) == 1
    assert "DATABASE_URL is not set" in caplog.text


@needs_db
def test_migrated_database_passes(db_engine):
    check_schema(db_engine)


@needs_db
def test_database_missing_a_column_fails(db_engine):
    with db_engine.connect() as conn:
        trans = conn.begin()
        conn.execute(text("ALTER TABLE road_edges DROP COLUMN speed_kph"))
        problems = find_problems(*read_schema(conn))
        trans.rollback()  # DDL is transactional in PostgreSQL, so the column comes back
    assert problems == ["table road_edges is missing columns: speed_kph"]
