import geopandas as gpd
import pytest
from shapely.geometry import LineString, Point, Polygon

from pipeline import settings
from pipeline.extract import area_polygon, buffer_polygon, check_boundary, load_snapshot, save_snapshot
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


def test_area_polygon_needs_relation_or_center():
    with pytest.raises(ValueError, match="needs either"):
        area_polygon(Area("broken", "Broken"), 100)


def test_area_polygon_for_center_area_needs_no_network():
    polygon = area_polygon(Area("test", "Test", center=(27.69, 85.30), radius_m=500), buffer_m=9999)
    assert polygon.geom_type == "Polygon"
    assert polygon.contains(Point(85.30, 27.69))


DISTRICT = Area("district", "Kathmandu District", osm_relation=1, min_area_km2=350)


def boundary(geometry) -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(geometry=[geometry], crs=settings.WGS84)


def test_check_boundary_accepts_a_district_sized_polygon():
    big = gpd.GeoDataFrame(geometry=[Point(85.32, 27.70)], crs=settings.WGS84).to_crs(settings.PROJECTED_CRS)
    check_boundary(big.buffer(12_000).to_crs(settings.WGS84).to_frame("geometry"), DISTRICT)  # ~452 km²


def test_check_boundary_rejects_a_building_matched_instead_of_the_district():
    office = Polygon([(85.3200, 27.6950), (85.3203, 27.6950), (85.3203, 27.6953), (85.3200, 27.6953)])
    with pytest.raises(ValueError, match="expected at least 350 km²"):
        check_boundary(boundary(office), DISTRICT)


@pytest.mark.parametrize("geometry", [Point(85.32, 27.70), LineString([(85.3, 27.7), (85.4, 27.7)])])
def test_check_boundary_rejects_non_polygons(geometry):
    with pytest.raises(ValueError, match="not a boundary polygon"):
        check_boundary(boundary(geometry), DISTRICT)


def test_check_boundary_rejects_empty_result():
    with pytest.raises(ValueError, match="not a boundary polygon"):
        check_boundary(gpd.GeoDataFrame(geometry=[], crs=settings.WGS84), DISTRICT)


def test_area_polygon_uses_the_osm_relation_id(monkeypatch):
    calls = []

    def fake_geocode(query, by_osmid=False):
        calls.append((query, by_osmid))
        return boundary(Point(85.32, 27.70).buffer(0.2))

    monkeypatch.setattr("pipeline.extract.ox.geocode_to_gdf", fake_geocode)
    area_polygon(DISTRICT, 2000)
    assert calls == [("R1", True)]


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
