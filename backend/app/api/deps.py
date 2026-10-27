from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import Connection

from app.state import RoutingState


def get_routing(request: Request) -> RoutingState:
    """The in-memory road graph and facilities loaded at startup."""
    return request.app.state.routing


def get_conn(request: Request) -> Iterator[Connection]:
    """A database connection for the length of one request."""
    with request.app.state.engine.connect() as conn:
        yield conn
