from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.routing.closures import DEFAULT_RADIUS_M


class HealthOut(BaseModel):
    status: Literal["ok"] = "ok"
    nodes: int
    edges: int
    closed_edges: int
    loaded_at: datetime


class SearchResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    type: Literal["facility", "road"]
    id: int | None  # facility id; roads have none
    name: str
    kind: str | None  # facility kind
    address: str | None
    lon: float
    lat: float
    distance_m: float | None  # straight line from the given point, when one is given


class RoadAtOut(BaseModel):
    road_name: str | None
    distance_m: float  # from the given point to the road
    lon: float         # closest point on the road
    lat: float


class LineString(BaseModel):
    type: Literal["LineString"] = "LineString"
    coordinates: list[list[float]]


class SnapOut(BaseModel):
    node_id: int | None = None  # the junction a nearest-facility search starts from (routes start on the road itself)
    distance_m: float           # from the chosen point to where the route starts or ends on the road


class RouteStepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    road_name: str | None  # None for unnamed roads
    distance_m: float
    duration_s: float


class AvoidedClosure(BaseModel):
    incident_id: int
    kind: str
    road_name: str | None
    lon: float
    lat: float


class UnverifiedOnRoute(BaseModel):
    incident_id: int
    kind: str
    road_name: str | None
    created_at: datetime
    lon: float
    lat: float


class DetourOut(BaseModel):
    usual_distance_m: float  # the best route if nothing were closed
    usual_duration_s: float
    closures: list[AvoidedClosure]  # the verified hazards that route would run into
    usual_geometry: LineString  # that route, to draw as the way that's closed


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
    steps: list[RouteStepOut]
    detour: DetourOut | None  # set when closures make this route longer than usual
    unverified: list[UnverifiedOnRoute] = []  # reports waiting for review along this route
    avoids_unverified: bool = False  # this route was asked to keep clear of unverified reports


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


class RegisterIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class EmailCodeIn(BaseModel):
    email: EmailStr
    code: str = Field(pattern=r"^\s*\d{6}\s*$")


class EmailIn(BaseModel):
    email: EmailStr


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class ResetPasswordIn(EmailCodeIn):
    new_password: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    role: str
    email_verified: bool
    created_at: datetime


class SessionOut(BaseModel):
    access_token: str  # the refresh token is set as an httpOnly cookie, out of reach of page scripts
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserOut


class MessageOut(BaseModel):
    message: str


IncidentKind = Literal["landslide", "flood", "accident", "road_blocked", "road_works", "other"]
Passable = Literal["no", "partly", "unsure"]


class IncidentIn(BaseModel):
    kind: IncidentKind
    passable: Passable = "unsure"
    note: str | None = Field(None, max_length=1000)  # the exact limit is checked after trimming whitespace
    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    passable: str
    note: str | None
    status: str
    lon: float  # on the road; the pin as dropped is kept for moderators only
    lat: float
    road_name: str | None
    snap_distance_m: float
    closure_radius_m: float | None
    created_at: datetime
    reviewed_at: datetime | None
    review_note: str | None  # the reason a report was rejected
    cleared_at: datetime | None
    merged_into_id: int | None


class ReporterOut(BaseModel):
    id: int
    name: str
    verified_reports: int  # verified or later cleared
    reviewed_reports: int  # verified, cleared or rejected


class QueueItem(IncidentOut):
    reporter: ReporterOut | None  # None once the account is deleted
    similar_reports: int  # other pending reports close by and close in time


class VerifyIn(BaseModel):
    radius_m: float = Field(DEFAULT_RADIUS_M, ge=5, le=200)


class RejectIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


class MergeIn(BaseModel):
    into_id: int


class ModerationOut(BaseModel):
    incident: IncidentOut
    closed_edges: int = 0    # road segments closed by this action
    reopened_edges: int = 0  # road segments open again (some may stay closed by another hazard)


class ClosureOut(BaseModel):
    incident_id: int
    kind: str
    road_name: str | None
    radius_m: float
    verified_at: datetime
    lon: float
    lat: float
    edges: int
    geometry: dict | None  # GeoJSON of the closed segments


class AuditOut(BaseModel):
    id: int
    created_at: datetime
    actor_id: int | None
    actor_name: str | None
    action: str
    target_type: str
    target_id: int
    details: dict
