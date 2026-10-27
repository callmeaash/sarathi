from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Connection, text

from app.api.deps import get_conn, get_routing
from app.api.routing import Kind, Lat, Lon
from app.routing.geo import parse_bbox, snap_to_node
from app.routing.graph import haversine_m
from app.routing.nearest import access_time_s
from app.routing.search import NoRouteError, Weight, find_route
from app.schemas import FacilityDetail, FeatureCollection, RoadDistance
from app.state import RoutingState

router = APIRouter(prefix="/facilities", tags=["facilities"])

# Enough for every facility in the valley; protects the map from huge responses.
MAX_FEATURES = 2000

IN_BBOX = text("""
    SELECT id, kind, coalesce(name_en, name, name_ne) AS name, ST_X(geom) AS lon, ST_Y(geom) AS lat
    FROM facilities
    WHERE geom && ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326) AND kind = ANY(:kinds)
    ORDER BY id
    LIMIT :limit
""")

DETAIL = text("""
    SELECT id, kind, coalesce(name_en, name, name_ne) AS name, name_en, name_ne, phone, opening_hours, address,
           emergency, source, osm_type, osm_id, nearest_node_id, coalesce(snap_distance_m, 0) AS access_m,
           ST_X(geom) AS lon, ST_Y(geom) AS lat
    FROM facilities WHERE id = :id
""")


@router.get("", response_model=FeatureCollection)
def list_facilities(bbox: str, kind: Annotated[list[Kind] | None, Query()] = None,
                    conn: Connection = Depends(get_conn)) -> FeatureCollection:
    """Facilities inside the visible map area, as light GeoJSON points for drawing markers."""
    try:
        min_lon, min_lat, max_lon, max_lat = parse_bbox(bbox)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    kinds = kind or ["hospital", "police", "pharmacy", "fire_station"]
    rows = conn.execute(IN_BBOX, {"min_lon": min_lon, "min_lat": min_lat, "max_lon": max_lon, "max_lat": max_lat,
                                  "kinds": kinds, "limit": MAX_FEATURES}).all()
    return FeatureCollection(features=[
        {"type": "Feature", "id": r.id, "geometry": {"type": "Point", "coordinates": [r.lon, r.lat]},
         "properties": {"id": r.id, "kind": r.kind, "name": r.name}}
        for r in rows
    ])


@router.get("/{facility_id}", response_model=FacilityDetail)
def get_facility(facility_id: int, from_lat: Lat | None = None, from_lon: Lon | None = None,
                 routing: RoutingState = Depends(get_routing), conn: Connection = Depends(get_conn)) -> FacilityDetail:
    """Full details of one facility, with the road distance from a point if one is given."""
    row = conn.execute(DETAIL, {"id": facility_id}).first()
    if row is None:
        raise HTTPException(404, f"facility {facility_id} not found")
    if (from_lat is None) != (from_lon is None):
        raise HTTPException(422, "give both from_lat and from_lon, or neither")

    road = None
    if from_lat is not None and row.nearest_node_id is not None and row.nearest_node_id in routing.graph.index:
        start = snap_to_node(conn, routing.graph, from_lon, from_lat)
        try:
            route = find_route(routing.graph, start.node_id, row.nearest_node_id, Weight.TIME)
        except NoRouteError:
            route = None
        if route is not None:
            road = RoadDistance(distance_m=route.length_m + row.access_m,
                                duration_s=route.travel_time_s + access_time_s(row.access_m),
                                straight_line_m=haversine_m(from_lon, from_lat, row.lon, row.lat))
    return FacilityDetail(
        id=row.id, kind=row.kind, name=row.name, lon=row.lon, lat=row.lat, name_en=row.name_en,
        name_ne=row.name_ne, phone=row.phone, opening_hours=row.opening_hours, address=row.address,
        emergency=row.emergency, source=row.source, osm_type=row.osm_type, osm_id=row.osm_id, road=road,
    )
