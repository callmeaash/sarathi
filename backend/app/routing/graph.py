import math
from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import Engine, text

# Same sphere OSMnx uses for edge lengths, so straight-line distances never exceed road lengths (A* stays exact).
EARTH_RADIUS_M = 6_371_009
# Both directions of a two-way road have the same length; a parallel road between the same junctions does not.
REVERSE_LENGTH_TOLERANCE_M = 0.01


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
    sources: list[int]          # start node of each edge position
    position: dict[int, int]    # database edge id -> edge position
    # Number of active closures on each edge. A count, not a flag: when two verified hazards block the same
    # road, clearing one must leave it closed.
    closures: list[int]

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

    def edge_position(self, edge_id: int) -> int:
        """Return the position of a database edge id."""
        try:
            return self.position[edge_id]
        except KeyError:
            raise KeyError(f"edge {edge_id} is not in the road graph") from None

    def reverse_positions(self, pos: int) -> list[int]:
        """Return the opposite direction of the same road: edges back from target to source with the same length."""
        source, target, length = self.sources[pos], self.targets[pos], self.length_m[pos]
        return [p for p in range(self.offsets[target], self.offsets[target + 1])
                if self.targets[p] == source and abs(self.length_m[p] - length) <= REVERSE_LENGTH_TOLERANCE_M]

    def _road_positions(self, edge_ids: Iterable[int], both_directions: bool) -> set[int]:
        """Positions of the given edges, plus their reverse direction if requested."""
        positions = {self.edge_position(e) for e in edge_ids}
        if both_directions:
            positions |= {r for p in list(positions) for r in self.reverse_positions(p)}
        return positions

    def close_edges(self, edge_ids: Iterable[int], both_directions: bool = True) -> list[int]:
        """Add a closure to the edges; return the ids of edges that were open and are now closed."""
        newly_closed = []
        for p in sorted(self._road_positions(edge_ids, both_directions)):
            if self.closures[p] == 0:
                newly_closed.append(self.edge_ids[p])
            self.closures[p] += 1
        return newly_closed

    def open_edges(self, edge_ids: Iterable[int], both_directions: bool = True) -> list[int]:
        """Remove a closure from the edges; return the ids of edges that are open again."""
        reopened = []
        for p in sorted(self._road_positions(edge_ids, both_directions)):
            if self.closures[p] == 0:
                continue  # already open; nothing to remove
            self.closures[p] -= 1
            if self.closures[p] == 0:
                reopened.append(self.edge_ids[p])
        return reopened

    def is_closed(self, edge_id: int) -> bool:
        """Return True if the edge has at least one active closure."""
        return self.closures[self.edge_position(edge_id)] > 0

    def closed_edge_ids(self) -> list[int]:
        """Ids of all currently closed edges."""
        return [self.edge_ids[p] for p, count in enumerate(self.closures) if count]


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

    offsets, sources, targets, edge_ids, length_m, travel_time_s = [0], [], [], [], [], []
    for source, out in enumerate(outgoing):
        for target, edge_id, length, seconds in out:
            sources.append(source)
            targets.append(target)
            edge_ids.append(edge_id)
            length_m.append(length)
            travel_time_s.append(seconds)
        offsets.append(len(targets))
    position = {edge_id: pos for pos, edge_id in enumerate(edge_ids)}
    if len(position) != len(edge_ids):
        raise ValueError("duplicate edge ids")
    return RoadGraph(node_ids, index, lon, lat, offsets, targets, edge_ids, length_m, travel_time_s, max_speed,
                     sources, position, [0] * len(edge_ids))


def load_graph(engine: Engine) -> RoadGraph:
    """Load the road network from PostGIS into memory."""
    with engine.connect() as conn:
        nodes = conn.execute(text("SELECT id, ST_X(geom), ST_Y(geom) FROM road_nodes ORDER BY id")).all()
        edges = conn.execute(text(
            "SELECT id, source, target, length_m, travel_time_s FROM road_edges ORDER BY source, id")).all()
    if not nodes:
        raise RuntimeError("the road network is empty; import it with: python -m pipeline")
    return build_graph(nodes, edges)
