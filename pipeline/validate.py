import math
from dataclasses import dataclass, field

import geopandas as gpd
import pandas as pd

from pipeline import settings


class ValidationError(Exception):
    pass


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors

    def raise_for_errors(self) -> None:
        if self.errors:
            raise ValidationError("; ".join(self.errors))


def _bad_numbers(series: pd.Series, allow_zero: bool) -> int:
    def bad(v) -> bool:
        if v is None or not isinstance(v, (int, float)) or math.isnan(v) or math.isinf(v):
            return True
        return v < 0 or (v == 0 and not allow_zero)
    return int(series.map(bad).sum())


def check_nodes(nodes: pd.DataFrame, min_nodes: int, report: Report) -> None:
    if len(nodes) < min_nodes:
        report.errors.append(f"only {len(nodes)} road nodes, expected at least {min_nodes}")
    if nodes["id"].duplicated().any():
        report.errors.append(f"{int(nodes['id'].duplicated().sum())} duplicate node ids")
    out_of_range = ~(nodes["lon"].between(-180, 180) & nodes["lat"].between(-90, 90))
    if out_of_range.any():
        report.errors.append(f"{int(out_of_range.sum())} nodes have invalid coordinates")


def check_edges(edges: pd.DataFrame, nodes: pd.DataFrame, report: Report) -> None:
    if edges.empty:
        report.errors.append("no road edges")
        return
    known = set(nodes["id"])
    dangling = ~(edges["source"].isin(known) & edges["target"].isin(known))
    if dangling.any():
        report.errors.append(f"{int(dangling.sum())} edges point to missing nodes")
    if edges.duplicated(["source", "target", "key"]).any():
        report.errors.append("duplicate edges (same source, target and key)")
    for col, allow_zero in (("length_m", True), ("speed_kph", False), ("travel_time_s", True)):
        bad = _bad_numbers(edges[col], allow_zero)
        if bad:
            report.errors.append(f"{bad} edges have an invalid {col}")
    if edges["wkt"].isna().any():
        report.errors.append(f"{int(edges['wkt'].isna().sum())} edges have no geometry")
    zero = int((edges["length_m"] == 0).sum())
    if zero:
        report.warnings.append(f"{zero} edges have zero length")


def check_facilities(facilities: gpd.GeoDataFrame, report: Report) -> None:
    counts = facilities["kind"].value_counts() if len(facilities) else pd.Series(dtype=int)
    if counts.get("hospital", 0) == 0:
        report.errors.append("no hospitals found")
    for kind in settings.FACILITY_KINDS:
        if kind != "hospital" and counts.get(kind, 0) == 0:
            report.warnings.append(f"no {kind.replace('_', ' ')} facilities found")
    if len(facilities) and facilities.duplicated(["osm_type", "osm_id"]).any():
        report.errors.append("duplicate OSM facilities")
    if len(facilities):
        unnamed = facilities[["name", "name_en", "name_ne"]].isna().all(axis=1).mean()
        if unnamed > 0.5:
            report.warnings.append(f"{unnamed:.0%} of facilities have no name")


def validate(nodes: pd.DataFrame, edges: pd.DataFrame, facilities: gpd.GeoDataFrame, min_nodes: int) -> Report:
    report = Report()
    check_nodes(nodes, min_nodes, report)
    check_edges(edges, nodes, report)
    check_facilities(facilities, report)
    return report
