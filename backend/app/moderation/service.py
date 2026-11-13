from datetime import datetime, timedelta, timezone

from sqlalchemy import Connection, Row, text
from sqlalchemy.orm import Session

from app.auth.service import revoke_all_tokens
from app.errors import Conflict, InvalidInput, NotFound
from app.incidents.service import MAX_REASON_LENGTH, MIN_REASON_LENGTH, audit, squash
from app.models import USER_ROLES, User
from app.routing.closures import edges_near
from app.state import RoutingState, active_closures

NEPAL_TIME = timezone(timedelta(hours=5, minutes=45))  # "today" on the dashboard is the day in Kathmandu
MEDIAN_WINDOW = timedelta(days=7)

STATS = text("""
    SELECT
        (SELECT count(*) FROM incidents WHERE status = 'pending') AS pending,
        (SELECT min(created_at) FROM incidents WHERE status = 'pending') AS oldest_pending_at,
        (SELECT count(*) FROM incidents WHERE created_at >= :today) AS reports_today,
        (SELECT count(*) FROM incidents WHERE status IN ('verified', 'cleared') AND reviewed_at >= :today)
            AS verified_today,
        (SELECT count(*) FROM incidents WHERE status = 'rejected' AND reviewed_at >= :today) AS rejected_today,
        (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM reviewed_at - created_at))
         FROM incidents WHERE status IN ('verified', 'cleared') AND reviewed_at >= :since) AS median_verify_s
""")

# Two-way roads are stored as one edge per direction; DISTINCT ON counts each stretch of road once.
PREVIEW = text("""
    SELECT count(*) AS edges,
           ST_AsGeoJSON(ST_Collect(geom)) AS geometry,
           array_remove(array_agg(DISTINCT coalesce(name_en, name)), NULL) AS roads,
           (SELECT coalesce(sum(d.length_m), 0) FROM (
                SELECT DISTINCT ON (least(source, target), greatest(source, target)) length_m
                FROM road_edges WHERE id = ANY(:ids)) d) AS length_m
    FROM road_edges WHERE id = ANY(:ids)
""")

USERS = text("""
    SELECT u.id, u.full_name, u.email, u.role, u.email_verified, u.status, u.created_at, u.last_login_at,
           count(i.id) AS reports,
           count(i.id) FILTER (WHERE i.status IN ('verified', 'cleared')) AS verified,
           count(i.id) FILTER (WHERE i.status = 'rejected') AS rejected,
           count(*) OVER () AS total
    FROM users u LEFT JOIN incidents i ON i.reporter_id = u.id
    WHERE (:pattern = '' OR u.full_name ILIKE :pattern ESCAPE '\\' OR u.email ILIKE :pattern ESCAPE '\\')
      AND (CAST(:role AS text) IS NULL OR u.role = :role)
      AND (CAST(:status AS text) IS NULL
           OR (:status = 'unverified' AND NOT u.email_verified AND u.status = 'active')
           OR (:status <> 'unverified' AND u.status = :status))
    GROUP BY u.id
    ORDER BY u.created_at DESC, u.id DESC
    LIMIT :limit OFFSET :offset
""")

USER_COUNTS = text("""
    SELECT count(*) AS users,
           count(*) FILTER (WHERE role = 'moderator') AS moderators,
           count(*) FILTER (WHERE status = 'suspended') AS suspended,
           count(*) FILTER (WHERE NOT email_verified) AS unverified
    FROM users
""")

USER_BY_ID = text("""
    SELECT u.id, u.full_name, u.email, u.role, u.email_verified, u.status, u.created_at, u.last_login_at,
           count(i.id) AS reports,
           count(i.id) FILTER (WHERE i.status IN ('verified', 'cleared')) AS verified,
           count(i.id) FILTER (WHERE i.status = 'rejected') AS rejected
    FROM users u LEFT JOIN incidents i ON i.reporter_id = u.id
    WHERE u.id = :id GROUP BY u.id
""")


def stats(session: Session, state: RoutingState, now: datetime) -> dict:
    """The numbers on the moderators' overview: what is waiting, what is closed, and today's work."""
    today = now.astimezone(NEPAL_TIME).replace(hour=0, minute=0, second=0, microsecond=0)
    row = session.execute(STATS, {"today": today, "since": now - MEDIAN_WINDOW}).one()
    closures = active_closures(state)
    return {**row._mapping, "active_closures": len(closures),
            "closed_edges": len({edge for edges in closures.values() for edge in edges})}


def closure_preview(conn: Connection, lon: float, lat: float, radius_m: float) -> Row:
    """What verifying a report with this radius would close: the road segments, their names and total length."""
    return conn.execute(PREVIEW, {"ids": edges_near(conn, lon, lat, radius_m)}).one()


def like_pattern(query: str) -> str:
    """A LIKE pattern matching text that contains the query, with its wildcards taken literally."""
    query = " ".join(query.split())
    if not query:
        return ""
    return "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def list_users(session: Session, query: str, role: str | None, status: str | None, limit: int,
               offset: int) -> tuple[list[Row], int]:
    """Accounts matching a search and filters, newest first, with their report record; and how many match."""
    rows = session.execute(USERS, {"pattern": like_pattern(query), "role": role, "status": status,
                                   "limit": limit, "offset": offset}).all()
    return rows, rows[0].total if rows else 0


def user_counts(session: Session) -> Row:
    """How many accounts there are, and how many are moderators, suspended or unverified."""
    return session.execute(USER_COUNTS).one()


def get_user(session: Session, user_id: int) -> Row:
    """One account with its report record."""
    row = session.execute(USER_BY_ID, {"id": user_id}).first()
    if row is None:
        raise NotFound(f"user {user_id} not found")
    return row


def other_user(session: Session, actor: User, user_id: int, action: str) -> User:
    """The account a moderator is acting on, locked for the change; never their own."""
    if user_id == actor.id:
        raise InvalidInput(f"you cannot {action} your own account")
    user = session.get(User, user_id, with_for_update=True)
    if user is None:
        raise NotFound(f"user {user_id} not found")
    return user


def suspend(session: Session, actor: User, user_id: int, reason: str, now: datetime) -> None:
    """Shut an account out (it is signed out everywhere), with a reason kept in the audit log."""
    reason = squash(reason)
    if not MIN_REASON_LENGTH <= len(reason) <= MAX_REASON_LENGTH:
        raise InvalidInput(f"reason must be {MIN_REASON_LENGTH} to {MAX_REASON_LENGTH} characters")
    user = other_user(session, actor, user_id, "suspend")
    if user.role == "moderator":
        raise Conflict("moderators cannot be suspended; change their role to user first")
    if user.status == "suspended":
        raise Conflict("this account is already suspended")
    user.status = "suspended"
    revoke_all_tokens(session, user.id, now, "suspended")
    audit(session, actor, "suspend", user.id, {"name": user.full_name, "reason": reason}, now, target_type="user")
    session.commit()


def reinstate(session: Session, actor: User, user_id: int, now: datetime) -> None:
    """Let a suspended account back in."""
    user = other_user(session, actor, user_id, "reinstate")
    if user.status != "suspended":
        raise Conflict("this account is not suspended")
    user.status = "active"
    audit(session, actor, "reinstate", user.id, {"name": user.full_name}, now, target_type="user")
    session.commit()


def change_role(session: Session, actor: User, user_id: int, role: str, now: datetime) -> None:
    """Make someone a moderator, or an ordinary user again."""
    if role not in USER_ROLES:
        raise InvalidInput(f"role must be one of {', '.join(USER_ROLES)}")
    user = other_user(session, actor, user_id, "change the role of")
    if user.role == role:
        raise Conflict(f"this account is already a {role}")
    if role == "moderator" and (user.status == "suspended" or not user.email_verified):
        raise Conflict("only active accounts with a confirmed email can be made moderators")
    previous, user.role = user.role, role
    audit(session, actor, "role", user.id, {"name": user.full_name, "from": previous, "to": role}, now,
          target_type="user")
    session.commit()
