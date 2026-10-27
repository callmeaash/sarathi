import geopandas as gpd
import pandas as pd
import pytest
from shapely.geometry import Point
from sqlalchemy import text

from pipeline import settings
from pipeline.load import run_import
from pipeline.tests.conftest import needs_db
from pipeline.transform import transform

pytestmark = needs_db


@pytest.fixture
def engine(db_engine):
    return db_engine


@pytest.fixture(autouse=True)
def clean(engine):
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE import_runs, facilities, road_edges, road_nodes RESTART IDENTITY CASCADE"))


@pytest.fixture
def data(graph, raw_facilities):
    return transform(graph, raw_facilities)


def scalar(engine, sql, **params):
    with engine.connect() as conn:
        return conn.execute(text(sql), params).scalar_one()


def test_load_inserts_everything(engine, data):
    result = run_import(engine, data, "test", "snap")
    assert result == {"road_nodes": 3, "road_edges": len(data.edges), "facilities": len(data.facilities)}
    assert scalar(engine, "SELECT count(*) FROM road_edges WHERE ST_SRID(geom) = 4326") == len(data.edges)
    assert scalar(engine, "SELECT bridge FROM road_edges WHERE source = 2 AND target = 3") is True


def test_facilities_snap_to_nearest_node(engine, data):
    run_import(engine, data, "test", None)
    assert scalar(engine, "SELECT count(*) FROM facilities WHERE nearest_node_id IS NULL") == 0
    # the fire station at lon 85.3030 is closest to node 3 (node 4 was dropped as unreachable)
    assert scalar(engine, "SELECT nearest_node_id FROM facilities WHERE osm_id = 9") == 3
    assert scalar(engine, "SELECT snap_distance_m FROM facilities WHERE osm_id = 9") > 0


def test_successful_run_is_recorded(engine, data):
    run_import(engine, data, "test", "snap-1")
    assert scalar(engine, "SELECT status FROM import_runs") == "succeeded"
    assert scalar(engine, "SELECT dropped_nodes FROM import_runs") == 2


def test_reimport_replaces_osm_rows_and_keeps_manual(engine, data):
    run_import(engine, data, "test", None)
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO facilities (kind, name, geom, source)
            VALUES ('hospital', 'Field Hospital', ST_SetSRID(ST_MakePoint(85.3001, 27.6901), 4326), 'manual')"""))
        conn.execute(text("UPDATE facilities SET source = 'manual', phone = 'edited' WHERE osm_id = 6"))

    data.facilities = data.facilities[data.facilities["osm_id"] != 7]           # removed from OSM
    data.facilities.loc[data.facilities["osm_id"] == 9, "name"] = "Kalimati Fire Station"  # renamed in OSM
    data.facilities.loc[data.facilities["osm_id"] == 6, "phone"] = "from osm"   # moderator edit must win
    run_import(engine, data, "test", None)

    assert scalar(engine, "SELECT count(*) FROM facilities WHERE osm_id = 7") == 0
    assert scalar(engine, "SELECT name FROM facilities WHERE osm_id = 9") == "Kalimati Fire Station"
    assert scalar(engine, "SELECT phone FROM facilities WHERE osm_id = 6") == "edited"
    assert scalar(engine, "SELECT nearest_node_id FROM facilities WHERE name = 'Field Hospital'") == 1
    assert scalar(engine, "SELECT count(*) FROM road_nodes") == 3


def test_failed_import_keeps_previous_data(engine, data):
    run_import(engine, data, "test", None)
    data.edges.loc[0, "target"] = 999  # foreign key violation
    with pytest.raises(Exception):
        run_import(engine, data, "test", "bad")

    assert scalar(engine, "SELECT count(*) FROM road_edges") == len(data.edges)
    assert scalar(engine, "SELECT count(*) FROM facilities WHERE nearest_node_id IS NOT NULL") == len(data.facilities)
    assert scalar(engine, "SELECT status FROM import_runs WHERE snapshot = 'bad'") == "failed"


def test_facility_with_no_roads_nearby_still_gets_a_node(engine, data):
    far = data.facilities.iloc[[0]].copy()
    far["osm_id"] = 999
    far["geometry"] = [Point(85.40, 27.75)]
    data.facilities = gpd.GeoDataFrame(pd.concat([data.facilities, far], ignore_index=True), crs=settings.WGS84)
    run_import(engine, data, "test", None)
    assert scalar(engine, "SELECT snap_distance_m FROM facilities WHERE osm_id = 999") > 5000
