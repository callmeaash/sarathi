import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import networkx as nx
import osmnx as ox
from osmnx._errors import InsufficientResponseError
from shapely.geometry import Point
from shapely.geometry.base import BaseGeometry

from pipeline import settings
from pipeline.settings import Area

log = logging.getLogger(__name__)

GRAPH_FILE = "graph.graphml"
FACILITIES_FILE = "facilities.geojson"
META_FILE = "meta.json"


def configure_osmnx() -> None:
    ox.settings.use_cache = True
    ox.settings.cache_folder = str(settings.CACHE_DIR)
    ox.settings.log_console = False
    ox.settings.useful_tags_way = list(dict.fromkeys([*ox.settings.useful_tags_way, *settings.EXTRA_WAY_TAGS]))


def buffer_polygon(boundary: gpd.GeoDataFrame, buffer_m: float) -> BaseGeometry:
    if buffer_m < 0:
        raise ValueError("buffer must not be negative")
    shape = boundary.to_crs(settings.PROJECTED_CRS).buffer(buffer_m).to_crs(settings.WGS84).union_all()
    if shape.is_empty or shape.geom_type not in ("Polygon", "MultiPolygon"):
        raise ValueError(f"area resolved to a {shape.geom_type}, not a polygon")
    return shape


def area_polygon(area: Area, buffer_m: float) -> BaseGeometry:
    if area.place:
        boundary = ox.geocode_to_gdf(area.place)
        if not boundary.geom_type.isin(["Polygon", "MultiPolygon"]).all():
            raise ValueError(f"'{area.place}' did not geocode to a boundary polygon")
        return buffer_polygon(boundary, buffer_m)
    if not area.center or area.radius_m <= 0:
        raise ValueError(f"area '{area.name}' needs either a place or a center and radius")
    lat, lon = area.center
    return buffer_polygon(gpd.GeoDataFrame(geometry=[Point(lon, lat)], crs=settings.WGS84), area.radius_m)


def download_roads(polygon: BaseGeometry) -> nx.MultiDiGraph:
    # retain_all keeps disconnected pieces so the transform step can report what it drops
    return ox.graph_from_polygon(polygon, network_type="drive", simplify=True, retain_all=True, truncate_by_edge=True)


def download_facilities(polygon: BaseGeometry) -> gpd.GeoDataFrame:
    try:
        raw = ox.features_from_polygon(polygon, tags=settings.FACILITY_TAGS)
    except InsufficientResponseError:
        log.warning("no facilities found in the area")
        return empty_facilities()
    return raw.reset_index().rename(columns={"element": "osm_type", "id": "osm_id"})


def empty_facilities() -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame({"osm_type": [], "osm_id": [], "amenity": []}, geometry=[], crs=settings.WGS84)


def save_snapshot(graph: nx.MultiDiGraph, facilities: gpd.GeoDataFrame, area: Area, buffer_m: float,
                  root: Path = settings.RAW_DIR) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = root / f"{area.name}-{stamp}"
    path.mkdir(parents=True)
    ox.save_graphml(graph, path / GRAPH_FILE)
    _stringify_lists(facilities).to_file(path / FACILITIES_FILE, driver="GeoJSON")
    meta = {
        "area": area.name,
        "buffer_m": buffer_m if area.place else area.radius_m,
        "downloaded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "osmnx_version": ox.__version__,
        "nodes": graph.number_of_nodes(),
        "edges": graph.number_of_edges(),
        "facilities": len(facilities),
    }
    (path / META_FILE).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return path


def load_snapshot(path: Path) -> tuple[nx.MultiDiGraph, gpd.GeoDataFrame, dict]:
    path = Path(path)
    missing = [f for f in (GRAPH_FILE, FACILITIES_FILE, META_FILE) if not (path / f).exists()]
    if missing:
        raise FileNotFoundError(f"snapshot {path} is missing {', '.join(missing)}")
    meta = json.loads((path / META_FILE).read_text(encoding="utf-8"))
    graph = ox.load_graphml(path / GRAPH_FILE)
    facilities = gpd.read_file(path / FACILITIES_FILE)
    if facilities.empty:
        facilities = empty_facilities()
    return graph, facilities, meta


def _stringify_lists(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    out = gdf.copy()
    for col in out.columns.drop("geometry"):
        if out[col].dtype == object:
            out[col] = out[col].map(lambda v: json.dumps(v, ensure_ascii=False) if isinstance(v, list) else v)
    return out
