import os
from logging.config import fileConfig

from alembic import context
from geoalchemy2 import alembic_helpers
from sqlalchemy import create_engine

from app import models  # noqa: F401  registers the tables on Base.metadata
from app.config import database_url
from app.db import Base

config = context.config
if config.config_file_name:
    # Keep loggers that already exist (e.g. the pipeline's when tests run migrations) working.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# Tests point migrations at a separate database through ALEMBIC_DATABASE_URL.
url = os.getenv("ALEMBIC_DATABASE_URL") or database_url()

# Search indexes are written by hand in SQL (trigram expressions the models can't describe); leave them out
# of autogenerate so it doesn't offer to drop them.
HAND_WRITTEN_INDEXES = {"ix_facilities_names_trgm", "ix_road_edges_names_trgm"}


def include_object(obj, name, type_, reflected, compare_to):
    """Skip the hand-written search indexes, then apply GeoAlchemy's own rules."""
    if type_ == "index" and name in HAND_WRITTEN_INDEXES:
        return False
    return alembic_helpers.include_object(obj, name, type_, reflected, compare_to)


options = dict(
    target_metadata=Base.metadata,
    include_object=include_object,
    process_revision_directives=alembic_helpers.writer,
    render_item=alembic_helpers.render_item,
)

if context.is_offline_mode():
    context.configure(url=url, literal_binds=True, **options)
    with context.begin_transaction():
        context.run_migrations()
else:
    with create_engine(url).connect() as connection:
        context.configure(connection=connection, **options)
        with context.begin_transaction():
            context.run_migrations()
