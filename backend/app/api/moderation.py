from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_routing, get_session, moderator, utc_now
from app.incidents import service
from app.models import User
from app.schemas import AuditOut, IncidentOut, MergeIn, ModerationOut, QueueItem, RejectIn, ReporterOut, VerifyIn
from app.state import RoutingState

router = APIRouter(tags=["moderation"])


def outcome(session: Session, incident_id: int, closed: int = 0, reopened: int = 0) -> ModerationOut:
    """The report as it is after a moderator's action, with how many road segments changed."""
    incident = IncidentOut.model_validate(service.get_incident(session, incident_id))
    return ModerationOut(incident=incident, closed_edges=closed, reopened_edges=reopened)


def queue_item(row) -> QueueItem:
    """A pending report with its reporter's track record."""
    reporter = None
    if row.reporter_id is not None:
        reporter = ReporterOut(id=row.reporter_id, name=row.reporter_name, verified_reports=row.reporter_verified,
                               reviewed_reports=row.reporter_reviewed)
    return QueueItem.model_validate({**row._mapping, "reporter": reporter})


@router.get("/moderation/queue", response_model=list[QueueItem])
def review_queue(limit: Annotated[int, Query(ge=1, le=200)] = 50, user: User = Depends(moderator),
                 session: Session = Depends(get_session)) -> list[QueueItem]:
    """Reports waiting for review, oldest first, with what moderators need to judge them."""
    return [queue_item(r) for r in service.queue(session, limit)]


@router.post("/incidents/{incident_id}/verify", response_model=ModerationOut)
def verify(incident_id: int, body: VerifyIn | None = None, user: User = Depends(moderator),
           session: Session = Depends(get_session), routing: RoutingState = Depends(get_routing)) -> ModerationOut:
    """Confirm a hazard and close the roads around it."""
    radius = (body or VerifyIn()).radius_m
    closed = service.verify(session, routing, user, incident_id, radius, utc_now())
    return outcome(session, incident_id, closed=len(closed))


@router.post("/incidents/{incident_id}/reject", response_model=ModerationOut)
def reject(incident_id: int, body: RejectIn, user: User = Depends(moderator),
           session: Session = Depends(get_session)) -> ModerationOut:
    """Turn down a report, with a reason the reporter will see."""
    service.reject(session, user, incident_id, body.reason, utc_now())
    return outcome(session, incident_id)


@router.post("/incidents/{incident_id}/clear", response_model=ModerationOut)
def clear(incident_id: int, user: User = Depends(moderator), session: Session = Depends(get_session),
          routing: RoutingState = Depends(get_routing)) -> ModerationOut:
    """Mark a verified hazard as gone and reopen its roads."""
    reopened = service.clear(session, routing, user, incident_id, utc_now())
    return outcome(session, incident_id, reopened=len(reopened))


@router.post("/incidents/{incident_id}/merge", response_model=ModerationOut)
def merge(incident_id: int, body: MergeIn, user: User = Depends(moderator),
          session: Session = Depends(get_session)) -> ModerationOut:
    """Mark a report as a duplicate of another one."""
    service.merge(session, user, incident_id, body.into_id, utc_now())
    return outcome(session, incident_id)


@router.get("/audit", response_model=list[AuditOut])
def audit_log(limit: Annotated[int, Query(ge=1, le=200)] = 50, before_id: Annotated[int | None, Query(ge=1)] = None,
              user: User = Depends(moderator), session: Session = Depends(get_session)) -> list[AuditOut]:
    """Who did what, newest first; pass the last id as before_id for the next page."""
    return [AuditOut.model_validate(r._mapping) for r in service.audit_entries(session, limit, before_id)]
