import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import Engine

from app.api import auth, facilities, incidents, moderation, routing
from app.auth.email import EmailSender, email_sender
from app.config import AuthSettings, load_auth_settings
from app.db import get_engine
from app.errors import AppError
from app.routing.geo import SnapError
from app.routing.search import NoRouteError
from app.state import RoutingState, load_routing_state

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

# The React dev server; set CORS_ORIGINS (comma separated) for other front ends.
DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"


def create_app(engine: Engine | None = None, routing_state: RoutingState | None = None,
               auth_settings: AuthSettings | None = None, sender: EmailSender | None = None) -> FastAPI:
    """Build the API; the database, graph, auth settings and email sender can be passed in for tests."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """Load settings, connect to the database and load the road graph once, before serving requests."""
        app.state.auth = auth_settings or load_auth_settings()
        app.state.email = sender or email_sender(app.state.auth)
        app.state.engine = engine or get_engine()
        app.state.routing = routing_state or load_routing_state(app.state.engine)
        yield
        if engine is None:
            app.state.engine.dispose()

    app = FastAPI(title="Sarathi API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=os.getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(","),
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(routing.router, prefix="/api")
    app.include_router(facilities.router, prefix="/api")
    app.include_router(auth.router, prefix="/api")
    app.include_router(incidents.router, prefix="/api")
    app.include_router(moderation.router, prefix="/api")

    @app.exception_handler(AppError)
    async def app_error(request: Request, exc: AppError) -> JSONResponse:
        """Turn rule violations into the matching HTTP status, with Retry-After for rate limits."""
        headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else None
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=headers)

    @app.exception_handler(SnapError)
    async def snap_error(request: Request, exc: SnapError) -> JSONResponse:
        """A point that cannot be matched to a road is a problem with the request."""
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(NoRouteError)
    async def no_route(request: Request, exc: NoRouteError) -> JSONResponse:
        """No open road connects the two points, e.g. because of closures."""
        return JSONResponse(status_code=404, content={"detail": "no open route between these points"})

    @app.get("/api/health", tags=["health"])
    def health(request: Request) -> dict:
        """Report that the API is up and how much map data is loaded."""
        state: RoutingState = request.app.state.routing
        return {"status": "ok", "nodes": state.graph.node_count, "edges": state.graph.edge_count,
                "closed_edges": len(state.graph.closed_edge_ids()), "loaded_at": state.loaded_at.isoformat()}

    return app


app = create_app()
