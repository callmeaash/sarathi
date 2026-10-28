from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Connection, text

from app.api.deps import get_conn, get_routing
from app.routing.details import closures_avoided, route_steps
from app.routing.geo import route_coordinates, snap_to_node
from app.routing.points import PlannedRoute, locate_on_road, plan_route
from app.routing.graph import haversine_m
from app.routing.nearest import nearest_facilities
from app.routing.roads import nearest_road
from app.routing.search import Algorithm, NoRouteError, Weight
from app.schemas import (
    AvoidedClosure, DetourOut, FacilitySummary, LineString, NearbyOut, NearestOut, RoadAtOut, RouteOut, RouteStepOut,
    SnapOut,
)
from app.state import RoutingState, active_closures

router = APIRouter(tags=["routing"])

Lat = Annotated[float, Query(ge=-90, le=90)]
Lon = Annotated[float, Query(ge=-180, le=180)]
Kind = Literal["hospital", "police", "pharmacy", "fire_station"]


@router.get("/route", response_model=RouteOut)
def get_route(from_lat: Lat, from_lon: Lon, to_lat: Lat, to_lon: Lon,
              weight: Weight = Weight.TIME, algorithm: Algorithm = Algorithm.ASTAR,
              routing: RoutingState = Depends(get_routing), conn: Connection = Depends(get_conn)) -> RouteOut:
    """Route between two map points avoiding closed roads, with its steps and any closures it goes around."""
    graph = routing.graph
    # Routes start and end at the closest spot on the road itself, not at the nearest junction.
    start = locate_on_road(conn, graph, from_lon, from_lat)
    end = locate_on_road(conn, graph, to_lon, to_lat)
    active = active_closures(routing)
    try:
        route = plan_route(conn, graph, start, end, weight, algorithm)
    except NoRouteError:
        if active and usual_route(graph, start, end, weight, algorithm) is not None:
            raise HTTPException(404, "closed roads cut off every route between these points") from None
        raise
    usual = usual_route(graph, start, end, weight, algorithm) if active else None
    detour = closures_avoided(route, usual, active)
    return RouteOut(
        distance_m=route.length_m,
        duration_s=route.time_s,
        weight=route.weight.value,
        algorithm=route.algorithm.value,
        visited_nodes=route.visited_nodes,
        runtime_ms=route.runtime_ms,
        start=SnapOut(distance_m=start.distance_m),
        end=SnapOut(distance_m=end.distance_m),
        edge_ids=route.edge_ids,
        geometry=LineString(coordinates=route.coords),
        steps=[RouteStepOut.model_validate(step) for step in route_steps(conn, route.legs)],
        detour=detour_out(conn, detour) if detour else None,
    )


def usual_route(graph, start, end, weight, algorithm) -> PlannedRoute | None:
    """The same route with every road open, or None when even that has no route."""
    try:
        return plan_route(None, graph, start, end, weight, algorithm, ignore_closures=True)
    except NoRouteError:
        return None


AVOIDED = text("SELECT id, kind, road_name FROM incidents WHERE id = ANY(:ids) ORDER BY id")


def detour_out(conn: Connection, detour) -> DetourOut:
    """The detour with each avoided hazard's kind and road, for the response."""
    rows = conn.execute(AVOIDED, {"ids": detour.incident_ids}).all() if detour.incident_ids else []
    return DetourOut(usual_distance_m=detour.usual_distance_m, usual_duration_s=detour.usual_duration_s,
                     closures=[AvoidedClosure(incident_id=r.id, kind=r.kind, road_name=r.road_name) for r in rows])


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


# Further than this from any road, a point is not "on" or "near" a road worth naming.
MAX_NEAREST_ROAD_M = 500


@router.get("/roads/nearest", response_model=RoadAtOut)
def get_nearest_road(lat: Lat, lon: Lon, conn: Connection = Depends(get_conn)) -> RoadAtOut:
    """The road closest to a map point, e.g. to describe a dropped pin as "near Kalimati Road"."""
    road = nearest_road(conn, lon, lat)
    if road is None or road.distance_m > MAX_NEAREST_ROAD_M:
        raise HTTPException(404, f"no road within {MAX_NEAREST_ROAD_M} m of this point")
    return RoadAtOut(road_name=road.road_name, distance_m=road.distance_m, lon=road.lon, lat=road.lat)
