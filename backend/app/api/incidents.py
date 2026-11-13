import json
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import current_user, get_routing, get_session, get_upload_dir, utc_now, verified_user
from app.incidents import photos, service
from app.models import User
from app.routing.geo import parse_bbox
from app.schemas import ClosureOut, IncidentIn, IncidentOut
from app.state import RoutingState

router = APIRouter(tags=["incidents"])

MAX_INCIDENTS = 500
Status = Literal["pending", "verified", "cleared"]


@router.post("/incidents", response_model=IncidentOut, status_code=201)
def report(body: IncidentIn, user: User = Depends(verified_user),
           session: Session = Depends(get_session)) -> IncidentOut:
    """Report a road hazard; it shows as unconfirmed until a moderator reviews it."""
    incident_id = service.create_incident(session, user, body.kind, body.passable, body.note, body.lon, body.lat,
                                          utc_now())
    return IncidentOut.model_validate(service.get_incident(session, incident_id))


@router.post("/incidents/{incident_id}/photos", response_model=IncidentOut, status_code=201)
def add_photo(incident_id: int, file: UploadFile, user: User = Depends(verified_user),
              session: Session = Depends(get_session), folder: Path = Depends(get_upload_dir)) -> IncidentOut:
    """Attach a photo (JPEG, PNG or WebP) to your own report while it is waiting for review."""
    data = file.file.read(photos.MAX_UPLOAD_BYTES + 1)
    if len(data) > photos.MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"photos can be at most {photos.MAX_UPLOAD_BYTES // (1024 * 1024)} MB")
    photos.add_photo(session, user, incident_id, data, folder, utc_now())
    return IncidentOut.model_validate(service.get_incident(session, incident_id))


@router.get("/photos/{name}", response_class=FileResponse, responses={200: {"content": {"image/jpeg": {}}}})
def get_photo(name: str, folder: Path = Depends(get_upload_dir)) -> FileResponse:
    """A report photo; its address is only known to people who can see the report."""
    path = photos.photo_path(folder, name)
    if path is None:
        raise HTTPException(404, "photo not found")
    # A photo never changes, so browsers can keep it; nosniff makes sure it is only ever treated as an image.
    return FileResponse(path, media_type="image/jpeg", headers={
        "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"})


@router.get("/incidents", response_model=list[IncidentOut])
def list_incidents(bbox: str, status: Annotated[list[Status] | None, Query()] = None,
                   session: Session = Depends(get_session)) -> list[IncidentOut]:
    """Pending and verified hazards inside the visible map area, newest first."""
    try:
        area = parse_bbox(bbox)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    rows = service.incidents_in_bbox(session, area, status or ["pending", "verified"], MAX_INCIDENTS)
    return [IncidentOut.model_validate(r) for r in rows]


@router.get("/incidents/mine", response_model=list[IncidentOut])
def my_reports(limit: Annotated[int, Query(ge=1, le=100)] = 50, user: User = Depends(current_user),
               session: Session = Depends(get_session)) -> list[IncidentOut]:
    """The signed-in user's own reports and what happened to them."""
    return [IncidentOut.model_validate(r) for r in service.reports_by(session, user, limit)]


@router.get("/incidents/{incident_id}", response_model=IncidentOut)
def get_incident(incident_id: int, session: Session = Depends(get_session)) -> IncidentOut:
    """One hazard report (rejected and merged reports are not public)."""
    return IncidentOut.model_validate(service.get_incident(session, incident_id, service.PUBLIC_STATUSES))


@router.get("/closures", response_model=list[ClosureOut])
def list_closures(session: Session = Depends(get_session),
                  routing: RoutingState = Depends(get_routing)) -> list[ClosureOut]:
    """Roads closed right now by verified hazards, for drawing on the map."""
    return [ClosureOut(incident_id=r.id, kind=r.kind, road_name=r.road_name, radius_m=r.closure_radius_m,
                       verified_at=r.reviewed_at, lon=r.lon, lat=r.lat, edges=r.edges,
                       geometry=json.loads(r.geometry) if r.geometry else None)
            for r in service.closures(session, routing)]
