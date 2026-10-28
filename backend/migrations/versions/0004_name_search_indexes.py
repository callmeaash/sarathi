"""name search indexes

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-28
"""
from alembic import op

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None

# Trigram indexes over every name a place or road has, so search is fast and tolerates small typos.
# The expressions must match app/search.py exactly for the indexes to be used.
FACILITY_NAMES = "lower(coalesce(name, '') || ' ' || coalesce(name_en, '') || ' ' || coalesce(name_ne, ''))"
ROAD_NAMES = "lower(coalesce(name, '') || ' ' || coalesce(name_en, ''))"


def upgrade() -> None:
    """Enable pg_trgm and index facility and road names for search."""
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(f"CREATE INDEX ix_facilities_names_trgm ON facilities USING gin (({FACILITY_NAMES}) gin_trgm_ops)")
    op.execute(f"CREATE INDEX ix_road_edges_names_trgm ON road_edges USING gin (({ROAD_NAMES}) gin_trgm_ops)")


def downgrade() -> None:
    """Drop the search indexes (the extension stays; other database objects may use it)."""
    op.execute("DROP INDEX IF EXISTS ix_road_edges_names_trgm")
    op.execute("DROP INDEX IF EXISTS ix_facilities_names_trgm")
