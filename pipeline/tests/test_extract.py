import geopandas as gpd
import pytest
from shapely.geometry import Point

from pipeline import settings
from pipeline.extract import area_polygon, buffer_polygon, load_snapshot, save_snapshot
from pipeline.settings import Area
from pipeline.transform import transform


def test_buffer_polygon_grows_by_the_buffer():
    point = gpd.GeoDataFrame(geometry=[Point(85.30, 27.69)], crs=settings.WGS84)
    area = gpd.GeoSeries([buffer_polygon(point, 1000)], crs=settings.WGS84).to_crs(settings.PROJECTED_CRS).area[0]
    assert area == pytest.approx(3.1416e6, rel=0.01)  # pi * 1000^2


def test_buffer_polygon_rejects_negative_buffer():
    point = gpd.GeoDataFrame(geometry=[Point(85.30, 27.69)], crs=settings.WGS84)
    with pytest.raises(ValueError, match="negative"):
        buffer_polygon(point, -1)


def test_buffer_polygon_rejects_point_without_buffer():
    point = gpd.GeoDataFrame(geometry=[Point(85.30, 27.69)], crs=settings.WGS84)
    with pytest.raises(ValueError, match="not a polygon"):
        buffer_polygon(point, 0)


def test_area_polygon_needs_place_or_center():
    with pytest.raises(ValueError, match="needs either"):
        area_polygon(Area("broken"), 100)


def test_area_polygon_for_center_area_needs_no_network():
    polygon = area_polygon(Area("test", center=(27.69, 85.30), radius_m=500), buffer_m=9999)
    assert polygon.geom_type == "Polygon"
    assert polygon.contains(Point(85.30, 27.69))


def test_snapshot_round_trip(tmp_path, graph, raw_facilities):
    raw_facilities["name"] = raw_facilities["name"].astype(object)
    raw_facilities.at[0, "name"] = ["Bir Hospital", "Bir"]  # list values must survive the file round trip
    path = save_snapshot(graph, raw_facilities, settings.AREAS["teku"], 0, root=tmp_path)
    loaded_graph, loaded_facilities, meta = load_snapshot(path)

    assert meta["area"] == "teku"
    assert meta["nodes"] == graph.number_of_nodes() and meta["facilities"] == len(raw_facilities)
    assert set(loaded_graph.nodes) == set(graph.nodes)
    assert loaded_graph.number_of_edges() == graph.number_of_edges()

    before, after = transform(graph, raw_facilities), transform(loaded_graph, loaded_facilities)
    assert len(after.edges) == len(before.edges)
    assert sorted(after.facilities["osm_id"]) == sorted(before.facilities["osm_id"])
    bir = after.facilities.set_index("osm_id")
    assert "Bir Hospital" in set(bir["name_en"].dropna()) | set(bir["name"].dropna())


def test_load_snapshot_reports_missing_files(tmp_path):
    with pytest.raises(FileNotFoundError, match="graph.graphml"):
        load_snapshot(tmp_path)
