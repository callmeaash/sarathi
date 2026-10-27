import ast
import math
import re
from dataclasses import dataclass

import geopandas as gpd
import networkx as nx
import numpy as np
import pandas as pd
from shapely import wkt as shapely_wkt
from shapely.geometry import LineString
from shapely.geometry.base import BaseGeometry

from pipeline import settings

NODE_COLUMNS = ["id", "lon", "lat", "street_count"]
EDGE_COLUMNS = ["source", "target", "key", "osm_way_id", "name", "name_en", "highway", "oneway",
                "bridge", "tunnel", "length_m", "speed_kph", "travel_time_s", "wkt"]
FACILITY_COLUMNS = ["osm_type", "osm_id", "kind", "name", "name_en", "name_ne", "phone",
                    "opening_hours", "address", "emergency"]
NEGATIVE_VALUES = {"no", "false", "0", ""}


@dataclass
class Transformed:
    nodes: pd.DataFrame
    edges: pd.DataFrame
    facilities: gpd.GeoDataFrame
    dropped_nodes: int


def is_missing(value) -> bool:
    return value is None or (isinstance(value, float) and math.isnan(value))


def as_list(value) -> list:
    # GraphML and GeoJSON round-trips turn OSMnx list attributes into strings like "['a', 'b']"
    if isinstance(value, str) and value.startswith("[") and value.endswith("]"):
        try:
            value = ast.literal_eval(value)
        except (ValueError, SyntaxError):
            return [value]
    if isinstance(value, (list, tuple, np.ndarray)):  # GeoJSON reads lists back as numpy arrays
        return list(value)
    return [value]


def first(value):
    return next((v for v in as_list(value) if not is_missing(v)), None)


def clean_text(value) -> str | None:
    value = first(value)
    if value is None:
        return None
    text = " ".join(str(value).split())
    return text or None


def tag_is_set(value) -> bool:
    return any(not is_missing(v) and str(v).strip().lower() not in NEGATIVE_VALUES for v in as_list(value))


def parse_bool(value) -> bool:
    value = first(value)
    if isinstance(value, bool):
        return value
    return value is not None and str(value).strip().lower() in {"true", "yes", "1", "-1"}


def speed_for(highway: str | None, speeds: dict[str, float], fallback: float) -> float:
    if not highway:
        return fallback
    return speeds.get(highway.removesuffix("_link"), fallback)


def add_speeds(graph: nx.MultiDiGraph, speeds: dict[str, float] = settings.SPEEDS_KPH,
               fallback: float = settings.FALLBACK_SPEED_KPH) -> nx.MultiDiGraph:
    if fallback <= 0 or any(s <= 0 for s in speeds.values()):
        raise ValueError("speeds must be positive")
    for u, v, data in graph.edges(data=True):
        length = data.get("length")
        length = 0.0 if is_missing(length) else float(length)
        if length < 0:
            raise ValueError(f"edge {u}->{v} has negative length {length}")
        speed = float(speed_for(clean_text(data.get("highway")), speeds, fallback))
        data["length"] = length
        data["speed_kph"] = speed
        data["travel_time_s"] = length / (speed / 3.6)
    return graph


def largest_strong_component(graph: nx.MultiDiGraph) -> tuple[nx.MultiDiGraph, int]:
    if graph.number_of_nodes() == 0:
        raise ValueError("road graph is empty")
    keep = max(nx.strongly_connected_components(graph), key=len)
    return graph.subgraph(keep).copy(), graph.number_of_nodes() - len(keep)


def nodes_table(graph: nx.MultiDiGraph) -> pd.DataFrame:
    rows = [
        (int(n), float(d["x"]), float(d["y"]), None if is_missing(d.get("street_count")) else int(d["street_count"]))
        for n, d in graph.nodes(data=True)
    ]
    return pd.DataFrame(rows, columns=NODE_COLUMNS).astype({"street_count": "Int64"})


def _edge_geometry(graph: nx.MultiDiGraph, u, v, data) -> BaseGeometry:
    geom = data.get("geometry")
    if isinstance(geom, str):
        geom = shapely_wkt.loads(geom)
    if geom is None or geom.is_empty:
        a, b = graph.nodes[u], graph.nodes[v]
        geom = LineString([(a["x"], a["y"]), (b["x"], b["y"])])
    return geom


def edges_table(graph: nx.MultiDiGraph) -> pd.DataFrame:
    rows = []
    for u, v, k, d in graph.edges(keys=True, data=True):
        way = first(d.get("osmid"))
        rows.append((
            int(u), int(v), int(k),
            None if way is None else int(way),
            clean_text(d.get("name")),
            clean_text(d.get("name:en")),
            clean_text(d.get("highway")) or "road",
            parse_bool(d.get("oneway")),
            tag_is_set(d.get("bridge")),
            tag_is_set(d.get("tunnel")),
            float(d["length"]), float(d["speed_kph"]), float(d["travel_time_s"]),
            _edge_geometry(graph, u, v, d).wkt,
        ))
    return pd.DataFrame(rows, columns=EDGE_COLUMNS).astype({"osm_way_id": "Int64"})


def _column(df: pd.DataFrame, name: str) -> pd.Series:
    return df[name] if name in df.columns else pd.Series(None, index=df.index, dtype=object)


def _mapped(series: pd.Series, fn) -> pd.Series:
    # Build an object column so missing results stay None (string columns in pandas 3 turn None into NaN).
    return pd.Series([fn(v) for v in series], index=series.index, dtype=object)


def clean_phone(value) -> str | None:
    text = clean_text(value)
    if not text:
        return None
    return clean_text(re.split(r"[;,/]", text)[0])


def parse_emergency(value) -> bool | None:
    text = (clean_text(value) or "").lower()
    if text in {"yes", "designated"}:
        return True
    if text == "no":
        return False
    return None


def _address(df: pd.DataFrame) -> pd.Series:
    pairs = zip(_column(df, "addr:street"), _column(df, "addr:city"))
    values = [", ".join(p for p in (clean_text(s), clean_text(c)) if p) or None for s, c in pairs]
    return pd.Series(values, index=df.index, dtype=object)


def is_veterinary(df: pd.DataFrame, pattern: str = settings.VETERINARY_PATTERN) -> pd.Series:
    def matches(v) -> bool:
        return bool(re.search(pattern, clean_text(v) or "", re.IGNORECASE))

    vet = _mapped(_column(df, "healthcare"), lambda v: clean_text(v) == "veterinary").astype(bool)
    for col in ("name", "name:en", "name:ne"):
        vet |= _mapped(_column(df, col), matches).astype(bool)
    return vet


def _name_keys(row) -> set[str]:
    return {re.sub(r"\W+", "", n.casefold()) for n in (row["name"], row["name_en"], row["name_ne"]) if n} - {""}


def dedupe_facilities(gdf: gpd.GeoDataFrame, radius_m: float = settings.DEDUPE_RADIUS_M) -> gpd.GeoDataFrame:
    # The same place is often mapped twice: as a point and as a building outline.
    if len(gdf) < 2:
        return gdf
    detail = gdf[["name_en", "phone", "opening_hours", "address", "emergency"]].notna().sum(axis=1)
    order = pd.DataFrame({"outline": gdf["osm_type"] != "node", "detail": detail}).sort_values(
        ["outline", "detail"], ascending=False).index
    projected = gdf.geometry.to_crs(settings.PROJECTED_CRS)
    kept: list = []
    for idx in order:
        keys = _name_keys(gdf.loc[idx])
        duplicate = keys and any(
            gdf.at[k, "kind"] == gdf.at[idx, "kind"]
            and keys & _name_keys(gdf.loc[k])
            and projected[k].distance(projected[idx]) <= radius_m
            for k in kept
        )
        if not duplicate:
            kept.append(idx)
    return gdf.loc[sorted(kept)]


def clean_facilities(raw: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    df = raw[_column(raw, "amenity").isin(settings.FACILITY_KINDS)]
    df = df[df.geometry.notna() & ~df.geometry.is_empty]
    df = df[~is_veterinary(df)]
    phones = zip(_column(df, "phone"), _column(df, "contact:phone"))
    out = gpd.GeoDataFrame(
        {
            "osm_type": _mapped(df["osm_type"], clean_text),
            "osm_id": df["osm_id"].astype("int64"),
            "kind": _mapped(df["amenity"], clean_text),
            "name": _mapped(_column(df, "name"), clean_text),
            "name_en": _mapped(_column(df, "name:en"), clean_text),
            "name_ne": _mapped(_column(df, "name:ne"), clean_text),
            "phone": pd.Series([clean_phone(p) or clean_phone(c) for p, c in phones], index=df.index, dtype=object),
            "opening_hours": _mapped(_column(df, "opening_hours"), clean_text),
            "address": _address(df),
            "emergency": _mapped(_column(df, "emergency"), parse_emergency),
        },
        geometry=df.geometry.representative_point(),
        crs=settings.WGS84,
    )
    return dedupe_facilities(out).reset_index(drop=True)


def transform(graph: nx.MultiDiGraph, raw_facilities: gpd.GeoDataFrame) -> Transformed:
    graph, dropped = largest_strong_component(graph)
    add_speeds(graph)
    return Transformed(nodes_table(graph), edges_table(graph), clean_facilities(raw_facilities), dropped)
