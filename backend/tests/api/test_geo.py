import pytest

from app.routing.geo import MAX_BBOX_SPAN_DEG, SnapError, check_coordinates, parse_bbox, stitch


def test_stitch_joins_lines_without_repeating_shared_points():
    lines = [[[0, 0], [1, 0]], [[1, 0], [1, 1]]]
    assert stitch(lines, [(0, 0), (1, 0)]) == [[0, 0], [1, 0], [1, 1]]


def test_stitch_flips_lines_drawn_against_travel():
    lines = [[[0, 0], [1, 0]], [[1, 1], [1, 0]]]  # second road stored from its far end
    assert stitch(lines, [(0, 0), (1, 0)]) == [[0, 0], [1, 0], [1, 1]]


def test_stitch_skips_empty_lines():
    assert stitch([[], [[0, 0], [1, 0]]], [(0, 0), (0, 0)]) == [[0, 0], [1, 0]]


def test_parse_bbox():
    assert parse_bbox("85.29,27.68,85.33,27.71") == (85.29, 27.68, 85.33, 27.71)


@pytest.mark.parametrize("bbox, message", [
    ("1,2,3", "four numbers"),
    ("a,b,c,d", "four numbers"),
    ("85.33,27.68,85.29,27.71", "wrong order"),
    ("85.29,27.71,85.33,27.68", "wrong order"),
    ("85.3,27.7,85.3,27.8", "wrong order"),
    ("200,27.6,201,27.7", "out of range"),
    (f"85.0,27.5,{85.0 + MAX_BBOX_SPAN_DEG + 0.1},27.6", "too large"),
])
def test_parse_bbox_rejects_bad_areas(bbox, message):
    with pytest.raises(ValueError, match=message):
        parse_bbox(bbox)


@pytest.mark.parametrize("lon, lat", [(181, 27.7), (85.3, 91), (-181, 0)])
def test_check_coordinates(lon, lat):
    with pytest.raises(SnapError):
        check_coordinates(lon, lat)
