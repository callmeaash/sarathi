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
    fileConfig(config.config_file_name)

# Tests point migrations at a separate database through ALEMBIC_DATABASE_URL.
url = os.getenv("ALEMBIC_DATABASE_URL") or database_url()

options = dict(
    target_metadata=Base.metadata,
    include_object=alembic_helpers.include_object,
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
