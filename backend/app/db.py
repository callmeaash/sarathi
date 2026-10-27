from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import database_url


class Base(DeclarativeBase):
    pass


def get_engine() -> Engine:
    """Create a SQLAlchemy engine for the configured database."""
    return create_engine(database_url())
