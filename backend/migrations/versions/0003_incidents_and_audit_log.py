"""incidents and audit log

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-27
"""
from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the incidents and audit log tables."""
    op.create_table(
        'audit_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('actor_id', sa.Integer(), nullable=True),
        sa.Column('action', sa.String(length=20), nullable=False),
        sa.Column('target_type', sa.String(length=20), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=False),
        sa.Column('details', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_audit_log_created', 'audit_log', ['created_at'], unique=False)

    op.create_table(
        'incidents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('reporter_id', sa.Integer(), nullable=True),
        sa.Column('kind', sa.String(length=20), nullable=False),
        sa.Column('passable', sa.String(length=10), server_default='unsure', nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=10), server_default='pending', nullable=False),
        sa.Column('geom', Geometry('POINT', srid=4326, spatial_index=False), nullable=False),
        sa.Column('reported_geom', Geometry('POINT', srid=4326, spatial_index=False), nullable=False),
        sa.Column('road_name', sa.Text(), nullable=True),
        sa.Column('snap_distance_m', sa.Double(), nullable=False),
        sa.Column('closure_radius_m', sa.Double(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('reviewed_by', sa.Integer(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('review_note', sa.Text(), nullable=True),
        sa.Column('cleared_by', sa.Integer(), nullable=True),
        sa.Column('cleared_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('merged_into_id', sa.Integer(), nullable=True),
        sa.CheckConstraint("kind IN ('landslide', 'flood', 'accident', 'road_blocked', 'road_works', 'other')",
                           name='ck_incidents_kind'),
        sa.CheckConstraint("passable IN ('no', 'partly', 'unsure')", name='ck_incidents_passable'),
        sa.CheckConstraint("status <> 'verified' OR closure_radius_m > 0", name='ck_incidents_verified_radius'),
        sa.CheckConstraint("status IN ('pending', 'verified', 'rejected', 'cleared', 'merged')",
                           name='ck_incidents_status'),
        sa.ForeignKeyConstraint(['cleared_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['merged_into_id'], ['incidents.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['reporter_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['reviewed_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_incidents_geom', 'incidents', ['geom'], postgresql_using='gist')
    op.create_index('ix_incidents_reporter', 'incidents', ['reporter_id'], unique=False)
    op.create_index('ix_incidents_status', 'incidents', ['status'], unique=False)


def downgrade() -> None:
    """Drop the incidents and audit log tables."""
    op.drop_table('incidents')
    op.drop_index('ix_audit_log_created', table_name='audit_log')
    op.drop_table('audit_log')
