import math

import networkx as nx
import numpy as np
import pytest
from shapely import wkt

from pipeline import settings
from pipeline.extract import empty_facilities
from pipeline.transform import (
    add_speeds, as_list, clean_facilities, clean_phone, clean_text, edges_table, first, largest_strong_component,
    nodes_table, parse_bool, parse_emergency, speed_for, tag_is_set, transform,
)


@pytest.mark.parametrize("value, expected", [
    (["a", "b"], ["a", "b"]),
    ("['a', 'b']", ["a", "b"]),
    ('["a", "b"]', ["a", "b"]),
    ("[not a list", ["[not a list"]),
    (np.array(["a", "b"]), ["a", "b"]),
    ("Kanti Path", ["Kanti Path"]),
    (None, [None]),
])
def test_as_list(value, expected):
    assert as_list(value) == expected


def test_first_skips_missing_values():
    assert first([None, float("nan"), "x"]) == "x"
    assert first([]) is None
    assert first(float("nan")) is None


@pytest.mark.parametrize("value, expected", [
    ("  Kanti   Path ", "Kanti Path"),
    ("", None),
    ("   ", None),
    (None, None),
    (float("nan"), None),
    (["Durbar Marg", "Kanti Path"], "Durbar Marg"),
    (42, "42"),
])
def test_clean_text(value, expected):
    assert clean_text(value) == expected


@pytest.mark.parametrize("value, expected", [
    ("yes", True), ("viaduct", True), (["no", "yes"], True), ("['yes']", True),
    ("no", False), (None, False), (float("nan"), False), ("", False), (False, False),
])
def test_tag_is_set(value, expected):
    assert tag_is_set(value) is expected


@pytest.mark.parametrize("value, expected", [
    (True, True), (False, False), ("True", True), ("False", False), ("yes", True), ("-1", True),
    (None, False), ([True, False], True),
])
def test_parse_bool(value, expected):
    assert parse_bool(value) is expected


def test_speed_for_handles_links_unknown_and_missing():
    speeds = {"primary": 35, "residential": 20}
    assert speed_for("primary", speeds, 15) == 35
    assert speed_for("primary_link", speeds, 15) == 35
    assert speed_for("track", speeds, 15) == 15
    assert speed_for(None, speeds, 15) == 15


def test_add_speeds_sets_speed_and_travel_time(graph):
    add_speeds(graph)
    data = graph.get_edge_data(1, 2)[0]
    assert data["speed_kph"] == settings.SPEEDS_KPH["primary"]
    assert data["travel_time_s"] == pytest.approx(100 / (35 / 3.6))
    assert graph.get_edge_data(2, 3)[0]["speed_kph"] == settings.SPEEDS_KPH["tertiary"]   # first of a list
    assert graph.get_edge_data(3, 4)[0]["speed_kph"] == settings.SPEEDS_KPH["secondary"]  # _link


def test_add_speeds_missing_length_counts_as_zero(graph):
    del graph.get_edge_data(1, 2)[0]["length"]
    add_speeds(graph)
    assert graph.get_edge_data(1, 2)[0]["travel_time_s"] == 0


def test_add_speeds_rejects_negative_length(graph):
    graph.get_edge_data(1, 2)[0]["length"] = -5.0
    with pytest.raises(ValueError, match="negative length"):
        add_speeds(graph)


@pytest.mark.parametrize("speeds, fallback", [({"primary": 0}, 20), ({"primary": 30}, 0), ({"x": -5}, 20)])
def test_add_speeds_rejects_non_positive_speeds(graph, speeds, fallback):
    with pytest.raises(ValueError, match="positive"):
        add_speeds(graph, speeds, fallback)


def test_largest_strong_component_drops_one_way_dead_end_and_isolated_node(graph):
    kept, dropped = largest_strong_component(graph)
    assert set(kept.nodes) == {1, 2, 3}
    assert dropped == 2
    assert set(graph.nodes) == {1, 2, 3, 4, 5}  # input is not modified


def test_largest_strong_component_rejects_empty_graph():
    with pytest.raises(ValueError, match="empty"):
        largest_strong_component(nx.MultiDiGraph())


def test_nodes_table(graph):
    graph.nodes[1].pop("street_count")
    table = nodes_table(graph)
    assert list(table.columns) == ["id", "lon", "lat", "street_count"]
    assert len(table) == 5
    assert table.set_index("id")["street_count"].isna()[1]


def test_edges_table_normalises_osm_values(graph):
    add_speeds(graph)
    table = edges_table(graph).set_index(["source", "target"])
    primary = table.loc[(1, 2)]
    assert primary["name"] == "Kanti Path" and primary["name_en"] == "Kanti Path"
    assert not bool(primary["oneway"])
    merged = table.loc[(2, 3)]
    assert merged["osm_way_id"] == 201
    assert merged["highway"] == "tertiary"
    assert bool(merged["bridge"]) and not bool(merged["tunnel"])
    assert bool(table.loc[(3, 4)]["oneway"])
    assert (4, 3) not in table.index
    line = wkt.loads(primary["wkt"])
    assert list(line.coords) == [(85.3000, 27.6900), (85.3010, 27.6900)]  # built from nodes when geometry is missing


def test_edges_table_uses_wkt_string_geometry(graph):
    add_speeds(graph)
    graph.get_edge_data(1, 2)[0]["geometry"] = "LINESTRING (85.3 27.69, 85.3005 27.6905, 85.301 27.69)"
    line = wkt.loads(edges_table(graph).set_index(["source", "target"]).loc[(1, 2), "wkt"])
    assert len(line.coords) == 3


@pytest.mark.parametrize("value, expected", [
    ("01-4221119; 01-4221988", "01-4221119"),
    ("9851000000, 9841000000", "9851000000"),
    ("  01-4221119 ", "01-4221119"),
    ("", None), (None, None), (float("nan"), None),
])
def test_clean_phone(value, expected):
    assert clean_phone(value) == expected


@pytest.mark.parametrize("value, expected", [
    ("yes", True), ("designated", True), ("no", False), ("YES", True), (None, None), ("unknown", None),
])
def test_parse_emergency(value, expected):
    assert parse_emergency(value) is expected


def test_clean_facilities(raw_facilities):
    out = clean_facilities(raw_facilities)
    names = set(out["name_en"].fillna(out["name"]).fillna(""))
    assert "Kuleshwor Clinic" not in names  # clinics are not a facility kind
    assert not any("Veterinary" in n or "पशु" in n or "Pet" in n for n in names)
    assert sorted(out["kind"]) == ["fire_station", "hospital", "pharmacy", "police"]
    assert (out.geometry.geom_type == "Point").all()


def test_clean_facilities_merges_point_and_outline_duplicates(raw_facilities):
    hospital = clean_facilities(raw_facilities).query("kind == 'hospital'")
    assert len(hospital) == 1
    assert hospital.iloc[0]["osm_type"] == "way"  # building outline is preferred
    assert hospital.iloc[0]["opening_hours"] == "24/7"


def test_clean_facilities_keeps_same_name_far_apart(raw_facilities):
    far = raw_facilities.copy()
    far.loc[far["osm_id"] == 2, "geometry"] = far.loc[far["osm_id"] == 2].geometry.translate(xoff=0.01)
    assert len(clean_facilities(far).query("kind == 'hospital'")) == 2


def test_clean_facilities_keeps_unnamed_and_normalises_fields(raw_facilities):
    out = clean_facilities(raw_facilities).set_index("osm_id")
    assert out.loc[7, "phone"] == "9851000000"   # from contact:phone
    assert out.loc[7, "name"] is None
    assert out.loc[6, "name"] == "Teku Police"
    assert out.loc[6, "address"] == "Teku Road, Kathmandu"
    assert out.loc[9, "emergency"] is False


def test_clean_facilities_drops_missing_geometry(raw_facilities):
    raw_facilities.loc[raw_facilities["osm_id"] == 6, "geometry"] = None
    assert 6 not in set(clean_facilities(raw_facilities)["osm_id"])


def test_clean_facilities_handles_empty_input():
    out = clean_facilities(empty_facilities())
    assert out.empty
    assert {"osm_type", "osm_id", "kind", "name", "phone"} <= set(out.columns)


def test_clean_facilities_handles_missing_optional_columns(raw_facilities):
    minimal = raw_facilities[["osm_type", "osm_id", "amenity", "geometry"]]
    out = clean_facilities(minimal)
    assert len(out) > 0 and out["name"].isna().all()


def test_transform_end_to_end(graph, raw_facilities):
    data = transform(graph, raw_facilities)
    assert data.dropped_nodes == 2
    assert set(data.nodes["id"]) == {1, 2, 3}
    assert set(data.edges["source"]) | set(data.edges["target"]) <= {1, 2, 3}
    assert all(math.isfinite(t) for t in data.edges["travel_time_s"])
