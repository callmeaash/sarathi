from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Connection

from app.api.deps import get_conn, get_routing
from app.routing.geo import route_coordinates, snap_to_node
from app.routing.graph import haversine_m
from app.routing.nearest import nearest_facilities
from app.routing.search import Algorithm, Weight, find_route
from app.schemas import FacilitySummary, LineString, NearbyOut, NearestOut, RouteOut, SnapOut
from app.state import RoutingState

router = APIRouter(tags=["routing"])

Lat = Annotated[float, Query(ge=-90, le=90)]
Lon = Annotated[float, Query(ge=-180, le=180)]
Kind = Literal["hospital", "police", "pharmacy", "fire_station"]


@router.get("/route", response_model=RouteOut)
def get_route(from_lat: Lat, from_lon: Lon, to_lat: Lat, to_lon: Lon,
              weight: Weight = Weight.TIME, algorithm: Algorithm = Algorithm.ASTAR,
              routing: RoutingState = Depends(get_routing), conn: Connection = Depends(get_conn)) -> RouteOut:
    """Route between two map points, avoiding closed roads."""
    graph = routing.graph
    start = snap_to_node(conn, graph, from_lon, from_lat)
    end = snap_to_node(conn, graph, to_lon, to_lat)
    route = find_route(graph, start.node_id, end.node_id, weight, algorithm)
    return RouteOut(
        distance_m=route.length_m,
        duration_s=route.travel_time_s,
        weight=route.weight.value,
        algorithm=route.algorithm.value,
        visited_nodes=route.visited_nodes,
        runtime_ms=route.runtime_ms,
        start=SnapOut(node_id=start.node_id, distance_m=start.distance_m),
        end=SnapOut(node_id=end.node_id, distance_m=end.distance_m),
        edge_ids=route.edge_ids,
        geometry=LineString(coordinates=route_coordinates(conn, graph, route)),
    )


@router.get("/nearest", response_model=NearestOut)
def get_nearest(lat: Lat, lon: Lon, kind: Kind = "hospital", limit: Annotated[int, Query(ge=1, le=10)] = 4,
                weight: Weight = Weight.TIME,
                routing: RoutingState = Depends(get_routing), conn: Connection = Depends(get_conn)) -> NearestOut:
    """The closest facilities of a kind by road from a map point, avoiding closed roads."""
    graph = routing.graph
    start = snap_to_node(conn, graph, lon, lat)
    results = []
    for found in nearest_facilities(graph, routing.facilities, start.node_id, kind, weight, limit):
        f = found.facility
        coords = route_coordinates(conn, graph, found.route)
        if coords[-1] != [f.lon, f.lat]:
            coords.append([f.lon, f.lat])  # last stretch from the road to the facility
        results.append(NearbyOut(
            facility=FacilitySummary(id=f.id, kind=f.kind, name=f.name, lon=f.lon, lat=f.lat),
            distance_m=found.length_m,
            duration_s=found.travel_time_s,
            straight_line_m=haversine_m(lon, lat, f.lon, f.lat),
            geometry=LineString(coordinates=coords),
        ))
    return NearestOut(kind=kind, weight=Weight(weight).value,
                      start=SnapOut(node_id=start.node_id, distance_m=start.distance_m), results=results)
