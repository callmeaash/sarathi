from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    BigInteger, Boolean, CheckConstraint, DateTime, Double, ForeignKey, Index, Integer,
    SmallInteger, String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

FACILITY_KINDS = ("hospital", "police", "pharmacy", "fire_station")
USER_ROLES = ("user", "moderator")
USER_STATUSES = ("active", "suspended")
CODE_PURPOSES = ("verify", "reset")
REVOKE_REASONS = ("rotated", "logout", "reset", "reuse", "suspended")


def point():
    """Return a WGS84 point geometry column type."""
    return Geometry("POINT", srid=4326, spatial_index=False)


class RoadNode(Base):
    __tablename__ = "road_nodes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)  # OSM node id
    geom = mapped_column(point(), nullable=False)
    street_count: Mapped[int | None] = mapped_column(SmallInteger)

    __table_args__ = (Index("ix_road_nodes_geom", "geom", postgresql_using="gist"),)


# One row per direction of travel: a two-way road is two rows.
class RoadEdge(Base):
    __tablename__ = "road_edges"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    source: Mapped[int] = mapped_column(BigInteger, ForeignKey("road_nodes.id", ondelete="CASCADE"), nullable=False)
    target: Mapped[int] = mapped_column(BigInteger, ForeignKey("road_nodes.id", ondelete="CASCADE"), nullable=False)
    key: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    osm_way_id: Mapped[int | None] = mapped_column(BigInteger)
    name: Mapped[str | None] = mapped_column(Text)
    name_en: Mapped[str | None] = mapped_column(Text)
    highway: Mapped[str] = mapped_column(String(32), nullable=False)
    oneway: Mapped[bool] = mapped_column(Boolean, nullable=False)
    bridge: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tunnel: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    length_m: Mapped[float] = mapped_column(Double, nullable=False)
    speed_kph: Mapped[float] = mapped_column(Double, nullable=False)
    travel_time_s: Mapped[float] = mapped_column(Double, nullable=False)
    geom = mapped_column(Geometry("LINESTRING", srid=4326, spatial_index=False), nullable=False)

    __table_args__ = (
        UniqueConstraint("source", "target", "key", name="uq_road_edges_source_target_key"),
        CheckConstraint("length_m >= 0", name="ck_road_edges_length"),
        CheckConstraint("speed_kph > 0", name="ck_road_edges_speed"),
        CheckConstraint("travel_time_s >= 0", name="ck_road_edges_travel_time"),
        Index("ix_road_edges_source", "source"),
        Index("ix_road_edges_target", "target"),
        Index("ix_road_edges_geom", "geom", postgresql_using="gist"),
    )


class Facility(Base):
    __tablename__ = "facilities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    osm_type: Mapped[str | None] = mapped_column(String(10))
    osm_id: Mapped[int | None] = mapped_column(BigInteger)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str | None] = mapped_column(Text)
    name_en: Mapped[str | None] = mapped_column(Text)
    name_ne: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    opening_hours: Mapped[str | None] = mapped_column(Text)
    address: Mapped[str | None] = mapped_column(Text)
    emergency: Mapped[bool | None] = mapped_column(Boolean)
    geom = mapped_column(point(), nullable=False)
    nearest_node_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("road_nodes.id", ondelete="SET NULL"))
    snap_distance_m: Mapped[float | None] = mapped_column(Double)
    # osm rows are replaced on re-import; manual rows (added or edited by moderators) are kept
    source: Mapped[str] = mapped_column(String(10), nullable=False, default="osm")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("osm_type", "osm_id", name="uq_facilities_osm"),
        CheckConstraint(f"kind IN {FACILITY_KINDS}", name="ck_facilities_kind"),
        CheckConstraint("source IN ('osm', 'manual')", name="ck_facilities_source"),
        CheckConstraint("source = 'manual' OR (osm_type IS NOT NULL AND osm_id IS NOT NULL)",
                        name="ck_facilities_osm_ref"),
        Index("ix_facilities_kind", "kind"),
        Index("ix_facilities_geom", "geom", postgresql_using="gist"),
    )


class ImportRun(Base):
    __tablename__ = "import_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(10), nullable=False)
    area: Mapped[str] = mapped_column(Text, nullable=False)
    snapshot: Mapped[str | None] = mapped_column(Text)
    nodes: Mapped[int | None] = mapped_column(Integer)
    edges: Mapped[int | None] = mapped_column(Integer)
    facilities: Mapped[int | None] = mapped_column(Integer)
    dropped_nodes: Mapped[int | None] = mapped_column(Integer)
    message: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (CheckConstraint("status IN ('succeeded', 'failed')", name="ck_import_runs_status"),)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(254), nullable=False)  # stored lower-case
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, server_default="user")
    email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    status: Mapped[str] = mapped_column(String(10), nullable=False, server_default="active")
    failed_logins: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        CheckConstraint("email = lower(email)", name="ck_users_email_lower"),
        CheckConstraint(f"role IN {USER_ROLES}", name="ck_users_role"),
        CheckConstraint(f"status IN {USER_STATUSES}", name="ck_users_status"),
    )


# One-time 6-digit codes for email verification and password reset; only a keyed hash is stored.
class EmailCode(Base):
    __tablename__ = "email_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    purpose: Mapped[str] = mapped_column(String(10), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint(f"purpose IN {CODE_PURPOSES}", name="ck_email_codes_purpose"),
        Index("ix_email_codes_user_purpose", "user_id", "purpose"),
    )


# Long-lived login tokens, rotated on every use; only a hash is stored so a database leak cannot be replayed.
class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Only a 'rotated' token coming back is suspicious (it was copied); one used after logout is not.
    revoke_reason: Mapped[str | None] = mapped_column(String(10))

    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_refresh_tokens_hash"),
        CheckConstraint(f"revoke_reason IN {REVOKE_REASONS}", name="ck_refresh_tokens_reason"),
        Index("ix_refresh_tokens_user", "user_id"),
    )
