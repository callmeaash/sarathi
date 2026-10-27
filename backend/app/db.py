from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import database_url


class Base(DeclarativeBase):
    pass


def get_engine() -> Engine:
    return create_engine(database_url())
