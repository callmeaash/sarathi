import pandas as pd
import pytest

from pipeline.transform import transform
from pipeline.validate import ValidationError, validate


@pytest.fixture
def data(graph, raw_facilities):
    return transform(graph, raw_facilities)


def test_valid_data_passes(data):
    report = validate(data.nodes, data.edges, data.facilities, min_nodes=3)
    assert report.ok, report.errors
    report.raise_for_errors()


def test_too_few_nodes(data):
    report = validate(data.nodes, data.edges, data.facilities, min_nodes=1000)
    assert any("road nodes" in e for e in report.errors)
    with pytest.raises(ValidationError):
        report.raise_for_errors()


def test_duplicate_node_ids(data):
    nodes = pd.concat([data.nodes, data.nodes.iloc[[0]]], ignore_index=True)
    assert any("duplicate node" in e for e in validate(nodes, data.edges, data.facilities, 1).errors)


def test_invalid_coordinates(data):
    data.nodes.loc[0, "lat"] = 123.0
    assert any("coordinates" in e for e in validate(data.nodes, data.edges, data.facilities, 1).errors)


def test_dangling_edges(data):
    data.edges.loc[0, "target"] = 999
    assert any("missing nodes" in e for e in validate(data.nodes, data.edges, data.facilities, 1).errors)


def test_duplicate_edges(data):
    edges = pd.concat([data.edges, data.edges.iloc[[0]]], ignore_index=True)
    assert any("duplicate edges" in e for e in validate(data.nodes, edges, data.facilities, 1).errors)


def test_no_edges(data):
    assert "no road edges" in validate(data.nodes, data.edges.iloc[0:0], data.facilities, 1).errors


@pytest.mark.parametrize("column, value", [
    ("speed_kph", 0.0), ("speed_kph", float("nan")), ("length_m", -1.0),
    ("travel_time_s", float("inf")), ("length_m", None),
])
def test_invalid_edge_numbers(data, column, value):
    data.edges[column] = data.edges[column].astype(object)
    data.edges.loc[0, column] = value
    assert any(column in e for e in validate(data.nodes, data.edges, data.facilities, 1).errors)


def test_missing_edge_geometry(data):
    data.edges.loc[0, "wkt"] = None
    assert any("geometry" in e for e in validate(data.nodes, data.edges, data.facilities, 1).errors)


def test_zero_length_is_only_a_warning(data):
    data.edges.loc[0, "length_m"] = 0.0
    data.edges.loc[0, "travel_time_s"] = 0.0
    report = validate(data.nodes, data.edges, data.facilities, 1)
    assert report.ok and any("zero length" in w for w in report.warnings)


def test_no_hospitals_is_an_error(data):
    facilities = data.facilities[data.facilities["kind"] != "hospital"]
    assert "no hospitals found" in validate(data.nodes, data.edges, facilities, 1).errors


def test_missing_other_kinds_are_warnings(data):
    facilities = data.facilities[data.facilities["kind"] == "hospital"]
    report = validate(data.nodes, data.edges, facilities, 1)
    assert report.ok
    assert {"no police facilities found", "no fire station facilities found"} <= set(report.warnings)


def test_no_facilities_at_all(data):
    report = validate(data.nodes, data.edges, data.facilities.iloc[0:0], 1)
    assert "no hospitals found" in report.errors


def test_duplicate_osm_facilities(data):
    facilities = pd.concat([data.facilities, data.facilities.iloc[[0]]], ignore_index=True)
    assert "duplicate OSM facilities" in validate(data.nodes, data.edges, facilities, 1).errors


def test_mostly_unnamed_facilities_warns(data):
    data.facilities[["name", "name_en", "name_ne"]] = None
    assert any("no name" in w for w in validate(data.nodes, data.edges, data.facilities, 1).warnings)
