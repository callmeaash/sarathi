import math
from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import Engine, text

# Same sphere OSMnx uses for edge lengths, so straight-line distances never exceed road lengths (A* stays exact).
EARTH_RADIUS_M = 6_371_009


def haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Great-circle distance in metres between two points."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(min(1.0, a)))


@dataclass
class RoadGraph:
    # Compressed sparse row layout: the edges leaving node i are positions offsets[i] to offsets[i + 1] - 1.
    node_ids: list[int]
    index: dict[int, int]
    lon: list[float]
    lat: list[float]
    offsets: list[int]
    targets: list[int]
    edge_ids: list[int]
    length_m: list[float]
    travel_time_s: list[float]
    max_speed_mps: float

    @property
    def node_count(self) -> int:
        """Number of nodes."""
        return len(self.node_ids)

    @property
    def edge_count(self) -> int:
        """Number of directed edges."""
        return len(self.targets)

    def node_index(self, node_id: int) -> int:
        """Return the internal index of an OSM node id."""
        try:
            return self.index[node_id]
        except KeyError:
            raise KeyError(f"node {node_id} is not in the road graph") from None

    def straight_line_m(self, a: int, b: int) -> float:
        """Great-circle distance in metres between two nodes given by internal index."""
        return haversine_m(self.lon[a], self.lat[a], self.lon[b], self.lat[b])


def build_graph(nodes: Iterable[tuple[int, float, float]],
                edges: Iterable[tuple[int, int, int, float, float]]) -> RoadGraph:
    """Build a graph from (id, lon, lat) nodes and (edge_id, source, target, length_m, travel_time_s) edges."""
    node_ids, lon, lat = [], [], []
    for node_id, x, y in nodes:
        node_ids.append(int(node_id))
        lon.append(float(x))
        lat.append(float(y))
    index = {node_id: i for i, node_id in enumerate(node_ids)}
    if len(index) != len(node_ids):
        raise ValueError("duplicate node ids")

    outgoing: list[list[tuple[int, int, float, float]]] = [[] for _ in node_ids]
    max_speed = 0.0
    for edge_id, source, target, length, seconds in edges:
        if source not in index or target not in index:
            raise ValueError(f"edge {edge_id} references a node that is not in the graph")
        length, seconds = float(length), float(seconds)
        if length < 0 or seconds < 0 or math.isnan(length) or math.isnan(seconds):
            raise ValueError(f"edge {edge_id} has a negative or missing length or travel time")
        if seconds > 0:
            max_speed = max(max_speed, length / seconds)
        outgoing[index[source]].append((index[target], int(edge_id), length, seconds))

    offsets, targets, edge_ids, length_m, travel_time_s = [0], [], [], [], []
    for out in outgoing:
        for target, edge_id, length, seconds in out:
            targets.append(target)
            edge_ids.append(edge_id)
            length_m.append(length)
            travel_time_s.append(seconds)
        offsets.append(len(targets))
    return RoadGraph(node_ids, index, lon, lat, offsets, targets, edge_ids, length_m, travel_time_s, max_speed)


def load_graph(engine: Engine) -> RoadGraph:
    """Load the road network from PostGIS into memory."""
    with engine.connect() as conn:
        nodes = conn.execute(text("SELECT id, ST_X(geom), ST_Y(geom) FROM road_nodes ORDER BY id")).all()
        edges = conn.execute(text(
            "SELECT id, source, target, length_m, travel_time_s FROM road_edges ORDER BY source, id")).all()
    if not nodes:
        raise RuntimeError("the road network is empty; import it with: python -m pipeline")
    return build_graph(nodes, edges)
