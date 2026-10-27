from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    BigInteger, Boolean, CheckConstraint, DateTime, Double, ForeignKey, Index, Integer,
    SmallInteger, String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

FACILITY_KINDS = ("hospital", "police", "pharmacy", "fire_station")


def point():
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
