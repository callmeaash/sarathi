import json
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_routing, get_session, moderator, utc_now
from app.incidents import service
from app.models import User
from app.moderation import service as moderation
from app.routing.closures import DEFAULT_RADIUS_M
from app.schemas import (
    AuditOut, ClosurePreview, IncidentOut, ManagedUser, MergeIn, ModerationOut, ModerationStats, NearbyReport,
    QueueItem, RejectIn, ReporterOut, RoleIn, SuspendIn, UserCounts, UserPage, VerifyIn,
)
from app.state import RoutingState

router = APIRouter(tags=["moderation"])

ReviewedStatus = Literal["verified", "rejected", "cleared", "merged"]
AuditAction = Literal["verify", "reject", "clear", "merge", "suspend", "reinstate", "role"]
UserFilter = Literal["active", "suspended", "unverified"]


def outcome(session: Session, incident_id: int, closed: int = 0, reopened: int = 0) -> ModerationOut:
    """The report as it is after a moderator's action, with how many road segments changed."""
    incident = IncidentOut.model_validate(service.get_incident(session, incident_id))
    return ModerationOut(incident=incident, closed_edges=closed, reopened_edges=reopened)


def queue_item(row, nearby: list | None = None) -> QueueItem:
    """A report as moderators see it, with its reporter's track record."""
    reporter = None
    if row.reporter_id is not None:
        reporter = ReporterOut(id=row.reporter_id, name=row.reporter_name, verified_reports=row.reporter_verified,
                               reviewed_reports=row.reporter_reviewed)
    return QueueItem.model_validate({**row._mapping, "reporter": reporter,
                                     "nearby": [NearbyReport.model_validate(n) for n in nearby or []]})


@router.get("/moderation/stats", response_model=ModerationStats)
def stats(user: User = Depends(moderator), session: Session = Depends(get_session),
          routing: RoutingState = Depends(get_routing)) -> ModerationStats:
    """The overview numbers: reports waiting, roads closed, and today's reports and decisions."""
    return ModerationStats.model_validate(moderation.stats(session, routing, utc_now()))


@router.get("/moderation/queue", response_model=list[QueueItem])
def review_queue(limit: Annotated[int, Query(ge=1, le=200)] = 50, user: User = Depends(moderator),
                 session: Session = Depends(get_session)) -> list[QueueItem]:
    """Reports waiting for review, oldest first, with what moderators need to judge them."""
    return [queue_item(r) for r in service.queue(session, limit)]


@router.get("/moderation/incidents", response_model=list[QueueItem])
def reviewed_reports(status: Annotated[list[ReviewedStatus], Query()], limit: Annotated[int, Query(ge=1, le=100)] = 30,
                     offset: Annotated[int, Query(ge=0)] = 0, user: User = Depends(moderator),
                     session: Session = Depends(get_session)) -> list[QueueItem]:
    """Reports that have been decided (including rejected and merged ones), most recent decision first."""
    return [queue_item(r) for r in service.reviewed(session, list(status), limit, offset)]


@router.get("/moderation/incidents/{incident_id}", response_model=QueueItem)
def report_for_review(incident_id: int, user: User = Depends(moderator),
                      session: Session = Depends(get_session)) -> QueueItem:
    """One report in full, whatever its status, with the open reports close to it."""
    return queue_item(*service.for_moderator(session, incident_id))


@router.get("/moderation/incidents/{incident_id}/closure-preview", response_model=ClosurePreview)
def closure_preview(incident_id: int, radius_m: Annotated[float, Query(ge=5, le=200)] = DEFAULT_RADIUS_M,
                    user: User = Depends(moderator), session: Session = Depends(get_session)) -> ClosurePreview:
    """Which roads verifying this report with the given radius would close, before doing it."""
    incident = service.get_incident(session, incident_id)
    row = moderation.closure_preview(session.connection(), incident.lon, incident.lat, radius_m)
    return ClosurePreview(radius_m=radius_m, edges=row.edges, length_m=row.length_m, roads=row.roads or [],
                          geometry=json.loads(row.geometry) if row.geometry else None)


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
              action: AuditAction | None = None, user: User = Depends(moderator),
              session: Session = Depends(get_session)) -> list[AuditOut]:
    """Who did what, newest first; pass the last id as before_id for the next page."""
    return [AuditOut.model_validate(r._mapping) for r in service.audit_entries(session, limit, before_id, action)]


@router.get("/moderation/users", response_model=UserPage)
def list_users(q: Annotated[str, Query(max_length=100)] = "", role: Literal["user", "moderator"] | None = None,
               status: UserFilter | None = None, limit: Annotated[int, Query(ge=1, le=100)] = 20,
               offset: Annotated[int, Query(ge=0)] = 0, user: User = Depends(moderator),
               session: Session = Depends(get_session)) -> UserPage:
    """Accounts, newest first, searched by name or email and filtered by role or status, with their report record."""
    rows, total = moderation.list_users(session, q, role, status, limit, offset)
    return UserPage(items=[ManagedUser.model_validate(r) for r in rows], total=total,
                    counts=UserCounts.model_validate(moderation.user_counts(session)))


def managed(session: Session, user_id: int) -> ManagedUser:
    """An account as it is after a moderator's action."""
    return ManagedUser.model_validate(moderation.get_user(session, user_id))


@router.post("/moderation/users/{user_id}/suspend", response_model=ManagedUser)
def suspend_user(user_id: int, body: SuspendIn, user: User = Depends(moderator),
                 session: Session = Depends(get_session)) -> ManagedUser:
    """Shut an account out and sign it out everywhere; the reason goes in the audit log."""
    moderation.suspend(session, user, user_id, body.reason, utc_now())
    return managed(session, user_id)


@router.post("/moderation/users/{user_id}/reinstate", response_model=ManagedUser)
def reinstate_user(user_id: int, user: User = Depends(moderator),
                   session: Session = Depends(get_session)) -> ManagedUser:
    """Let a suspended account back in."""
    moderation.reinstate(session, user, user_id, utc_now())
    return managed(session, user_id)


@router.post("/moderation/users/{user_id}/role", response_model=ManagedUser)
def change_user_role(user_id: int, body: RoleIn, user: User = Depends(moderator),
                     session: Session = Depends(get_session)) -> ManagedUser:
    """Make someone a moderator, or an ordinary user again."""
    moderation.change_role(session, user, user_id, body.role, utc_now())
    return managed(session, user_id)
