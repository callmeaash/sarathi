"""road network, facilities and import runs

Revision ID: 0001
Revises:
Create Date: 2026-10-27
"""
from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the road network, facilities and import run tables."""
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "road_nodes",
        sa.Column("id", sa.BigInteger(), autoincrement=False, nullable=False),
        sa.Column("geom", Geometry("POINT", srid=4326, spatial_index=False), nullable=False),
        sa.Column("street_count", sa.SmallInteger(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_road_nodes_geom", "road_nodes", ["geom"], postgresql_using="gist")

    op.create_table(
        "road_edges",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("source", sa.BigInteger(), nullable=False),
        sa.Column("target", sa.BigInteger(), nullable=False),
        sa.Column("key", sa.SmallInteger(), nullable=False),
        sa.Column("osm_way_id", sa.BigInteger(), nullable=True),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("name_en", sa.Text(), nullable=True),
        sa.Column("highway", sa.String(32), nullable=False),
        sa.Column("oneway", sa.Boolean(), nullable=False),
        sa.Column("bridge", sa.Boolean(), nullable=False),
        sa.Column("tunnel", sa.Boolean(), nullable=False),
        sa.Column("length_m", sa.Double(), nullable=False),
        sa.Column("speed_kph", sa.Double(), nullable=False),
        sa.Column("travel_time_s", sa.Double(), nullable=False),
        sa.Column("geom", Geometry("LINESTRING", srid=4326, spatial_index=False), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["source"], ["road_nodes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target"], ["road_nodes.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("source", "target", "key", name="uq_road_edges_source_target_key"),
        sa.CheckConstraint("length_m >= 0", name="ck_road_edges_length"),
        sa.CheckConstraint("speed_kph > 0", name="ck_road_edges_speed"),
        sa.CheckConstraint("travel_time_s >= 0", name="ck_road_edges_travel_time"),
    )
    op.create_index("ix_road_edges_source", "road_edges", ["source"])
    op.create_index("ix_road_edges_target", "road_edges", ["target"])
    op.create_index("ix_road_edges_geom", "road_edges", ["geom"], postgresql_using="gist")

    op.create_table(
        "facilities",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("osm_type", sa.String(10), nullable=True),
        sa.Column("osm_id", sa.BigInteger(), nullable=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("name_en", sa.Text(), nullable=True),
        sa.Column("name_ne", sa.Text(), nullable=True),
        sa.Column("phone", sa.Text(), nullable=True),
        sa.Column("opening_hours", sa.Text(), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("emergency", sa.Boolean(), nullable=True),
        sa.Column("geom", Geometry("POINT", srid=4326, spatial_index=False), nullable=False),
        sa.Column("nearest_node_id", sa.BigInteger(), nullable=True),
        sa.Column("snap_distance_m", sa.Double(), nullable=True),
        sa.Column("source", sa.String(10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["nearest_node_id"], ["road_nodes.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("osm_type", "osm_id", name="uq_facilities_osm"),
        sa.CheckConstraint("kind IN ('hospital', 'police', 'pharmacy', 'fire_station')", name="ck_facilities_kind"),
        sa.CheckConstraint("source IN ('osm', 'manual')", name="ck_facilities_source"),
        sa.CheckConstraint("source = 'manual' OR (osm_type IS NOT NULL AND osm_id IS NOT NULL)",
                           name="ck_facilities_osm_ref"),
    )
    op.create_index("ix_facilities_kind", "facilities", ["kind"])
    op.create_index("ix_facilities_geom", "facilities", ["geom"], postgresql_using="gist")

    op.create_table(
        "import_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("area", sa.Text(), nullable=False),
        sa.Column("snapshot", sa.Text(), nullable=True),
        sa.Column("nodes", sa.Integer(), nullable=True),
        sa.Column("edges", sa.Integer(), nullable=True),
        sa.Column("facilities", sa.Integer(), nullable=True),
        sa.Column("dropped_nodes", sa.Integer(), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("status IN ('succeeded', 'failed')", name="ck_import_runs_status"),
    )


def downgrade() -> None:
    """Drop the tables created by this migration."""
    op.drop_table("import_runs")
    op.drop_table("facilities")
    op.drop_table("road_edges")
    op.drop_table("road_nodes")
