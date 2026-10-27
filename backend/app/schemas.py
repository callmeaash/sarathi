from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=200)


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


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserOut


class MessageOut(BaseModel):
    message: str
