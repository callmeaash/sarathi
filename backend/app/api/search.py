from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Connection

from app.api.deps import get_conn
from app.api.routing import Lat, Lon
from app.schemas import SearchResult
from app.search import search

router = APIRouter(tags=["search"])


@router.get("/search", response_model=list[SearchResult])
def search_places(q: Annotated[str, Query(max_length=60)], lat: Lat | None = None, lon: Lon | None = None,
                  limit: Annotated[int, Query(ge=1, le=20)] = 8,
                  conn: Connection = Depends(get_conn)) -> list[SearchResult]:
    """Facilities and roads by name, for the search box; with a point, each result has its distance from it."""
    if (lat is None) != (lon is None):
        raise HTTPException(422, "give both lat and lon, or neither")
    try:
        hits = search(conn, q, limit, (lon, lat) if lat is not None else None)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    return [SearchResult.model_validate(hit) for hit in hits]
