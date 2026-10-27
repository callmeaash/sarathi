import math
from datetime import datetime, timedelta

from geoalchemy2 import WKTElement
from sqlalchemy import Row, func, select, text
from sqlalchemy.orm import Session

from app.errors import Conflict, InvalidInput, NotFound, TooManyRequests
from app.models import AuditLog, Incident, User
from app.routing.closures import edges_near
from app.state import RoutingState, active_closures, apply_closure, lift_closure

MAX_REPORT_SNAP_M = 150         # a pin further than this from any road is not a road hazard we can route around
MAX_REPORTS_PER_HOUR = 10
DUPLICATE_RADIUS_M = 50         # the same user reporting the same kind this close, within an hour, is a repeat
SIMILAR_RADIUS_M = 150          # other people's pending reports this close are shown to moderators
SIMILAR_WINDOW = timedelta(hours=2)
MIN_CLOSURE_RADIUS_M, MAX_CLOSURE_RADIUS_M = 5, 200
MAX_NOTE_LENGTH = 200
MIN_REASON_LENGTH, MAX_REASON_LENGTH = 3, 300
PUBLIC_STATUSES = ("pending", "verified", "cleared")  # rejected and merged reports are only shown to their reporter

SNAP_TO_ROAD = text("""
    SELECT coalesce(e.name_en, e.name) AS road, ST_Distance(e.geom::geography, p.geom::geography) AS dist,
           ST_X(ST_ClosestPoint(e.geom, p.geom)) AS lon, ST_Y(ST_ClosestPoint(e.geom, p.geom)) AS lat
    FROM (SELECT ST_SetSRID(ST_MakePoint(:lon, :lat), 4326) AS geom) p
    CROSS JOIN LATERAL (SELECT name, name_en, geom FROM road_edges ORDER BY geom <-> p.geom LIMIT 10) e
    ORDER BY dist
    LIMIT 1
""")

DUPLICATE = text("""
    SELECT id FROM incidents
    WHERE reporter_id = :user AND kind = :kind AND status = 'pending' AND created_at > :since
      AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :radius)
    LIMIT 1
""")

FIELDS = """
    i.id, i.kind, i.passable, i.note, i.status, ST_X(i.geom) AS lon, ST_Y(i.geom) AS lat, i.road_name,
    i.snap_distance_m, i.closure_radius_m, i.created_at, i.reviewed_at, i.review_note, i.cleared_at, i.merged_into_id
"""

BY_ID = text(f"SELECT {FIELDS} FROM incidents i WHERE i.id = :id")

IN_BBOX = text(f"""
    SELECT {FIELDS} FROM incidents i
    WHERE i.geom && ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326) AND i.status = ANY(:statuses)
    ORDER BY i.created_at DESC
    LIMIT :limit
""")

BY_REPORTER = text(f"""
    SELECT {FIELDS} FROM incidents i WHERE i.reporter_id = :user ORDER BY i.created_at DESC, i.id DESC LIMIT :limit
""")

QUEUE = text(f"""
    SELECT {FIELDS}, i.reporter_id, u.full_name AS reporter_name,
        (SELECT count(*) FROM incidents r WHERE r.reporter_id = i.reporter_id
            AND r.status IN ('verified', 'cleared')) AS reporter_verified,
        (SELECT count(*) FROM incidents r WHERE r.reporter_id = i.reporter_id
            AND r.status IN ('verified', 'cleared', 'rejected')) AS reporter_reviewed,
        (SELECT count(*) FROM incidents s WHERE s.id <> i.id AND s.status = 'pending'
            AND abs(extract(epoch FROM s.created_at - i.created_at)) <= :window
            AND ST_DWithin(s.geom::geography, i.geom::geography, :radius)) AS similar_reports
    FROM incidents i LEFT JOIN users u ON u.id = i.reporter_id
    WHERE i.status = 'pending'
    ORDER BY i.created_at, i.id
    LIMIT :limit
""")

CLOSURES = text("""
    SELECT i.id, i.kind, i.road_name, i.closure_radius_m, i.reviewed_at, ST_X(i.geom) AS lon, ST_Y(i.geom) AS lat,
           count(e.id) AS edges, ST_AsGeoJSON(ST_Collect(e.geom)) AS geometry
    FROM incidents i
    LEFT JOIN unnest(CAST(:incident_ids AS int[]), CAST(:edge_ids AS bigint[])) AS c(incident_id, edge_id)
        ON c.incident_id = i.id
    LEFT JOIN road_edges e ON e.id = c.edge_id
    WHERE i.id = ANY(:ids)
    GROUP BY i.id
    ORDER BY i.reviewed_at DESC, i.id DESC
""")

AUDIT = text("""
    SELECT a.id, a.created_at, a.actor_id, u.full_name AS actor_name, a.action, a.target_type, a.target_id, a.details
    FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
    WHERE a.id < :before
    ORDER BY a.id DESC
    LIMIT :limit
""")


def point(lon: float, lat: float) -> WKTElement:
    """A WGS84 point for a geometry column."""
    return WKTElement(f"POINT({lon} {lat})", srid=4326)


def squash(value: str | None) -> str:
    """Trim and collapse runs of whitespace."""
    return " ".join(value.split()) if value else ""


def audit(session: Session, actor: User, action: str, target_id: int, details: dict, now: datetime) -> None:
    """Add an audit log entry for an incident (committed together with the change it records)."""
    session.add(AuditLog(actor_id=actor.id, action=action, target_type="incident", target_id=target_id,
                         details=details, created_at=now))


def check_rate(session: Session, user: User, now: datetime) -> None:
    """Refuse a report if the user has already sent the hourly maximum."""
    since = now - timedelta(hours=1)
    count, oldest = session.execute(select(func.count(), func.min(Incident.created_at)).where(
        Incident.reporter_id == user.id, Incident.created_at > since)).one()
    if count >= MAX_REPORTS_PER_HOUR:
        wait = math.ceil((oldest - since).total_seconds())
        raise TooManyRequests("too many reports in the last hour; please try again later", max(wait, 1))


def create_incident(session: Session, user: User, kind: str, passable: str, note: str | None, lon: float,
                    lat: float, now: datetime) -> int:
    """Save a pending hazard report, snapped onto the nearest road; returns its id."""
    note = squash(note)
    if len(note) > MAX_NOTE_LENGTH:
        raise InvalidInput(f"note must be at most {MAX_NOTE_LENGTH} characters")
    check_rate(session, user, now)

    road = session.execute(SNAP_TO_ROAD, {"lon": lon, "lat": lat}).first()
    if road is None or road.dist > MAX_REPORT_SNAP_M:
        raise InvalidInput(f"no road within {MAX_REPORT_SNAP_M} m of this point; place the pin on the road")
    if session.execute(DUPLICATE, {"user": user.id, "kind": kind, "since": now - timedelta(hours=1),
                                   "lon": road.lon, "lat": road.lat, "radius": DUPLICATE_RADIUS_M}).first():
        raise Conflict("you have already reported this hazard; it is waiting for review")

    incident = Incident(reporter_id=user.id, kind=kind, passable=passable, note=note or None, created_at=now,
                        geom=point(road.lon, road.lat), reported_geom=point(lon, lat), road_name=road.road,
                        snap_distance_m=float(road.dist))
    session.add(incident)
    session.commit()
    return incident.id


def locked_incident(session: Session, incident_id: int) -> Incident:
    """Load an incident and lock its row until the transaction ends, so two moderators cannot clash."""
    incident = session.get(Incident, incident_id, with_for_update=True)
    if incident is None:
        raise NotFound(f"report {incident_id} not found")
    return incident


def require_status(incident: Incident, allowed: str, action: str) -> None:
    """Reject an action that does not fit the report's current status."""
    if incident.status != allowed:
        raise Conflict(f"only {allowed} reports can be {action}; report {incident.id} is {incident.status}")


def verify(session: Session, state: RoutingState, moderator: User, incident_id: int, radius_m: float,
           now: datetime) -> list[int]:
    """Confirm a report and close every road within radius_m of it; returns the closed edges."""
    if not MIN_CLOSURE_RADIUS_M <= radius_m <= MAX_CLOSURE_RADIUS_M:
        raise InvalidInput(f"closure radius must be {MIN_CLOSURE_RADIUS_M} to {MAX_CLOSURE_RADIUS_M} m")
    incident = locked_incident(session, incident_id)
    require_status(incident, "pending", "verified")
    location = session.execute(BY_ID, {"id": incident_id}).one()
    edge_ids = edges_near(session.connection(), location.lon, location.lat, radius_m)
    incident.status, incident.closure_radius_m = "verified", radius_m
    incident.reviewed_by, incident.reviewed_at = moderator.id, now
    audit(session, moderator, "verify", incident_id,
          {"radius_m": radius_m, "closed_edges": len(edge_ids), "road": incident.road_name}, now)
    session.commit()
    # The graph changes only after the commit, so a failed save never leaves a road closed in memory.
    return apply_closure(state, incident_id, edge_ids)


def reject(session: Session, moderator: User, incident_id: int, reason: str, now: datetime) -> None:
    """Turn down a report with a reason the reporter can see."""
    reason = squash(reason)
    if not MIN_REASON_LENGTH <= len(reason) <= MAX_REASON_LENGTH:
        raise InvalidInput(f"reason must be {MIN_REASON_LENGTH} to {MAX_REASON_LENGTH} characters")
    incident = locked_incident(session, incident_id)
    require_status(incident, "pending", "rejected")
    incident.status, incident.review_note = "rejected", reason
    incident.reviewed_by, incident.reviewed_at = moderator.id, now
    audit(session, moderator, "reject", incident_id, {"reason": reason}, now)
    session.commit()


def clear(session: Session, state: RoutingState, moderator: User, incident_id: int, now: datetime) -> list[int]:
    """Mark a verified hazard as gone and reopen its roads; returns the edges that are open again."""
    incident = locked_incident(session, incident_id)
    require_status(incident, "verified", "cleared")
    incident.status, incident.cleared_by, incident.cleared_at = "cleared", moderator.id, now
    audit(session, moderator, "clear", incident_id, {"closed_edges": len(state.closures.get(incident_id, []))}, now)
    session.commit()
    return lift_closure(state, incident_id)


def merge(session: Session, moderator: User, incident_id: int, into_id: int, now: datetime) -> None:
    """Mark a pending report as a duplicate of another open report."""
    if incident_id == into_id:
        raise InvalidInput("a report cannot be merged into itself")
    incident = locked_incident(session, incident_id)
    require_status(incident, "pending", "merged")
    target = session.get(Incident, into_id)
    if target is None:
        raise NotFound(f"report {into_id} not found")
    if target.status not in ("pending", "verified"):
        raise Conflict(f"reports can only be merged into a pending or verified report; {into_id} is {target.status}")
    incident.status, incident.merged_into_id = "merged", into_id
    incident.reviewed_by, incident.reviewed_at = moderator.id, now
    audit(session, moderator, "merge", incident_id, {"into": into_id}, now)
    session.commit()


def get_incident(session: Session, incident_id: int, statuses: tuple[str, ...] | None = None) -> Row:
    """One report, optionally only if it has one of the given statuses."""
    row = session.execute(BY_ID, {"id": incident_id}).first()
    if row is None or (statuses is not None and row.status not in statuses):
        raise NotFound(f"report {incident_id} not found")
    return row


def incidents_in_bbox(session: Session, bbox: tuple[float, float, float, float], statuses: list[str],
                      limit: int) -> list[Row]:
    """Reports inside a map area, newest first."""
    min_lon, min_lat, max_lon, max_lat = bbox
    return session.execute(IN_BBOX, {"min_lon": min_lon, "min_lat": min_lat, "max_lon": max_lon, "max_lat": max_lat,
                                     "statuses": statuses, "limit": limit}).all()


def reports_by(session: Session, user: User, limit: int) -> list[Row]:
    """A user's own reports, newest first, whatever their status."""
    return session.execute(BY_REPORTER, {"user": user.id, "limit": limit}).all()


def queue(session: Session, limit: int) -> list[Row]:
    """Pending reports, oldest first, with the reporter's record and nearby similar reports."""
    return session.execute(QUEUE, {"window": SIMILAR_WINDOW.total_seconds(), "radius": SIMILAR_RADIUS_M,
                                   "limit": limit}).all()


def closures(session: Session, state: RoutingState) -> list[Row]:
    """Roads currently closed by verified hazards, grouped by hazard, with their geometry."""
    current = active_closures(state)
    pairs = [(incident_id, edge_id) for incident_id, edge_ids in current.items() for edge_id in edge_ids]
    return session.execute(CLOSURES, {"ids": list(current), "incident_ids": [p[0] for p in pairs],
                                      "edge_ids": [p[1] for p in pairs]}).all()


def audit_entries(session: Session, limit: int, before_id: int | None) -> list[Row]:
    """Audit log, newest first; pass the last id seen to get the next page."""
    return session.execute(AUDIT, {"limit": limit, "before": before_id or 2**31 - 1}).all()
