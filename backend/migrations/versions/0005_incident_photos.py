"""incident photos

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-13
"""
from alembic import op
import sqlalchemy as sa

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the table of photos attached to hazard reports."""
    op.create_table(
        'incident_photos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('incident_id', sa.Integer(), nullable=False),
        sa.Column('file_name', sa.String(length=40), nullable=False),
        sa.Column('width', sa.Integer(), nullable=False),
        sa.Column('height', sa.Integer(), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['incident_id'], ['incidents.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('file_name', name='uq_incident_photos_file_name'),
    )
    op.create_index('ix_incident_photos_incident', 'incident_photos', ['incident_id'], unique=False)


def downgrade() -> None:
    """Drop the incident photos table."""
    op.drop_index('ix_incident_photos_incident', table_name='incident_photos')
    op.drop_table('incident_photos')
