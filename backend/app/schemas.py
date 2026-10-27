from typing import Literal

from pydantic import BaseModel


class LineString(BaseModel):
    type: Literal["LineString"] = "LineString"
    coordinates: list[list[float]]


class SnapOut(BaseModel):
    node_id: int
    distance_m: float  # from the clicked point to the road junction the route starts or ends at


class RouteOut(BaseModel):
    distance_m: float
    duration_s: float
    weight: str
    algorithm: str
    visited_nodes: int
    runtime_ms: float
    start: SnapOut
    end: SnapOut
    edge_ids: list[int]
    geometry: LineString


class FacilitySummary(BaseModel):
    id: int
    kind: str
    name: str | None
    lon: float
    lat: float


class NearbyOut(BaseModel):
    facility: FacilitySummary
    distance_m: float
    duration_s: float
    straight_line_m: float
    geometry: LineString


class NearestOut(BaseModel):
    kind: str
    weight: str
    start: SnapOut
    results: list[NearbyOut]


class RoadDistance(BaseModel):
    distance_m: float
    duration_s: float
    straight_line_m: float


class FacilityDetail(FacilitySummary):
    name_en: str | None
    name_ne: str | None
    phone: str | None
    opening_hours: str | None
    address: str | None
    emergency: bool | None
    source: str
    osm_type: str | None
    osm_id: int | None
    road: RoadDistance | None  # only when a starting point is given


class FeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[dict]
