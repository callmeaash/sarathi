import geopandas as gpd
import networkx as nx
import pytest
from shapely.geometry import Point, Polygon

COORDS = {
    1: (85.3000, 27.6900),
    2: (85.3010, 27.6900),
    3: (85.3020, 27.6900),
    4: (85.3030, 27.6900),
    5: (85.3100, 27.7000),  # isolated
}


def add_road(graph, u, v, oneway=False, **attrs):
    data = {"length": 100.0, "highway": "residential", "oneway": oneway, "osmid": 100 + u, **attrs}
    graph.add_edge(u, v, **data)
    if not oneway:
        graph.add_edge(v, u, **{**data, "reversed": True})


@pytest.fixture
def graph() -> nx.MultiDiGraph:
    # 1 <-> 2 <-> 3 -> 4 (one-way dead end), 5 isolated
    g = nx.MultiDiGraph(crs="EPSG:4326")
    for n, (x, y) in COORDS.items():
        g.add_node(n, x=x, y=y, street_count=2)
    add_road(g, 1, 2, highway="primary", name="Kanti Path", **{"name:en": "Kanti Path"})
    add_road(g, 2, 3, highway=["tertiary", "residential"], osmid=[201, 202], bridge="yes")
    add_road(g, 3, 4, oneway=True, highway="secondary_link")
    return g


def facility_frame(rows: list[dict]) -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(rows, geometry=[r.pop("geometry") for r in rows], crs="EPSG:4326")


def square(x, y, d=0.0002):
    return Polygon([(x, y), (x + d, y), (x + d, y + d), (x, y + d)])


@pytest.fixture
def raw_facilities() -> gpd.GeoDataFrame:
    return facility_frame([
        {"osm_type": "node", "osm_id": 1, "amenity": "hospital", "name": "Bir Hospital",
         "phone": "01-4221119; 01-4221988", "emergency": "yes", "geometry": Point(85.3010, 27.6901)},
        # same hospital mapped as a building outline next to the point, with more detail
        {"osm_type": "way", "osm_id": 2, "amenity": "hospital", "name": "वीर अस्पताल", "name:en": "Bir Hospital",
         "opening_hours": "24/7", "geometry": square(85.3010, 27.6901)},
        {"osm_type": "node", "osm_id": 3, "amenity": "hospital", "name": "Nepal Veterinary Hospital",
         "geometry": Point(85.3020, 27.6902)},
        {"osm_type": "node", "osm_id": 4, "amenity": "hospital", "name": "पशु अस्पताल",
         "geometry": Point(85.3021, 27.6902)},
        {"osm_type": "node", "osm_id": 5, "amenity": "clinic", "name": "Kuleshwor Clinic",
         "geometry": Point(85.3001, 27.6901)},
        {"osm_type": "node", "osm_id": 6, "amenity": "police", "name": "  Teku   Police ",
         "addr:street": "Teku Road", "addr:city": "Kathmandu", "geometry": Point(85.3020, 27.6899)},
        {"osm_type": "node", "osm_id": 7, "amenity": "pharmacy", "contact:phone": "9851000000",
         "geometry": Point(85.3011, 27.6899)},
        {"osm_type": "node", "osm_id": 8, "amenity": "pharmacy", "healthcare": "veterinary", "name": "Pet Pharmacy",
         "geometry": Point(85.3012, 27.6899)},
        {"osm_type": "node", "osm_id": 9, "amenity": "fire_station", "name": "Fire Station",
         "emergency": "no", "geometry": Point(85.3030, 27.6901)},
    ])
