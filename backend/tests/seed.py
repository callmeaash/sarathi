from sqlalchemy import text

from app.routing.graph import haversine_m

#  2 ----- 3     A small network around a river. Node 0 is the usual start; hospital A is across the river
#  |       |     near node 1 (road goes 0-2-3-1); hospital B is at node 4 with a direct road.
#  0 ~~~~~ 1
#  |
#  4
NODES = {0: (85.3000, 27.7000), 1: (85.3020, 27.7000), 2: (85.3000, 27.7100), 3: (85.3020, 27.7100),
         4: (85.2960, 27.7000)}
ROADS = [(0, 2), (2, 3), (3, 1), (0, 4)]  # road i is stored as edges 10 + 2i (a -> b) and 11 + 2i (b -> a)
SPEED_MPS = 10


def insert_edge(conn, edge_id, source, target, draw_from, draw_to, name=None):
    length = haversine_m(*NODES[source], *NODES[target])
    conn.execute(text("""
        INSERT INTO road_edges (id, source, target, key, name, highway, oneway, bridge, tunnel, length_m, speed_kph,
                                travel_time_s, geom)
        VALUES (:id, :s, :t, 0, :name, 'residential', false, false, false, :len, 36, :sec,
                ST_MakeLine(ST_SetSRID(ST_MakePoint(:ax, :ay), 4326), ST_SetSRID(ST_MakePoint(:bx, :by), 4326)))
    """), {"id": edge_id, "s": source, "t": target, "name": name, "len": length, "sec": length / SPEED_MPS,
           "ax": NODES[draw_from][0], "ay": NODES[draw_from][1], "bx": NODES[draw_to][0], "by": NODES[draw_to][1]})


def insert_facility(conn, osm_id, kind, name, lon, lat, node, snap_m, source="osm"):
    conn.execute(text("""
        INSERT INTO facilities (osm_type, osm_id, kind, name, phone, emergency, geom, nearest_node_id,
                                snap_distance_m, source)
        VALUES ('node', :osm_id, :kind, :name, '01-4XXXXXX', true, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
                :node, :snap, :source)
    """), {"osm_id": osm_id, "kind": kind, "name": name, "lon": lon, "lat": lat, "node": node, "snap": snap_m,
           "source": source})


def seed_network(engine, road_names=None):
    road_names = road_names or {}
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE incidents, audit_log, import_runs, facilities, road_edges, road_nodes "
                          "RESTART IDENTITY CASCADE"))
        for node, (x, y) in NODES.items():
            conn.execute(text("INSERT INTO road_nodes (id, geom) VALUES (:id, ST_SetSRID(ST_MakePoint(:x, :y), 4326))"),
                         {"id": node, "x": x, "y": y})
        for i, (a, b) in enumerate(ROADS):
            name = road_names.get((a, b))
            insert_edge(conn, 10 + 2 * i, a, b, a, b, name)
            insert_edge(conn, 11 + 2 * i, b, a, a, b, name)  # reverse direction stored with forward geometry
        insert_facility(conn, 1, "hospital", "Across the river", 85.3020, 27.7003, 1, 33)
        insert_facility(conn, 2, "hospital", "West Hospital", *NODES[4], 4, 0)
        insert_facility(conn, 3, "police", "North Police", *NODES[2], 2, 0)
        insert_facility(conn, 4, "pharmacy", "Not on the network", 85.31, 27.71, None, None)


def route(client, a, b, **params):
    return client.get("/api/route", params={"from_lon": NODES[a][0], "from_lat": NODES[a][1],
                                            "to_lon": NODES[b][0], "to_lat": NODES[b][1], **params})


def seed_graph(engine, nodes: dict, roads: list[tuple], speed_mps: float = SPEED_MPS):
    """Replace the road network: roads are (a, b), (a, b, name) or (a, b, name, "oneway"); edge ids from 100."""
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE incidents, audit_log, import_runs, facilities, road_edges, road_nodes "
                          "RESTART IDENTITY CASCADE"))
        for node, (x, y) in nodes.items():
            conn.execute(text("INSERT INTO road_nodes (id, geom) VALUES (:id, ST_SetSRID(ST_MakePoint(:x, :y), 4326))"),
                         {"id": node, "x": x, "y": y})
        for i, (a, b, *rest) in enumerate(roads):
            name = rest[0] if rest else None
            oneway = len(rest) > 1 and rest[1] == "oneway"
            length = haversine_m(*nodes[a], *nodes[b])
            directions = ((100 + 2 * i, a, b),) if oneway else ((100 + 2 * i, a, b), (101 + 2 * i, b, a))
            for edge_id, source, target in directions:
                conn.execute(text("""
                    INSERT INTO road_edges (id, source, target, key, name, highway, oneway, bridge, tunnel, length_m,
                                            speed_kph, travel_time_s, geom)
                    VALUES (:id, :s, :t, 0, :name, 'residential', false, false, false, :len, 36, :sec,
                            ST_MakeLine(ST_SetSRID(ST_MakePoint(:ax, :ay), 4326),
                                        ST_SetSRID(ST_MakePoint(:bx, :by), 4326)))
                """), {"id": edge_id, "s": source, "t": target, "name": name, "len": length,
                       "sec": length / speed_mps, "ax": nodes[source][0], "ay": nodes[source][1],
                       "bx": nodes[target][0], "by": nodes[target][1]})
