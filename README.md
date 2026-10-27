# Sarathi

Find open roads in Kathmandu: verified road closures, routes around them, and the nearest hospital by road.

## Project layout

- `backend/` FastAPI app; owns the database schema (`app/models.py`, Alembic migrations)
- `pipeline/` ETL that imports OpenStreetMap roads and facilities into PostGIS
- `data/` raw snapshots and download cache (not committed)

## Requirements

- Python 3.12 or newer
- PostgreSQL 18 with PostGIS (installed locally, e.g. with the EDB installer and Stack Builder)

## Setup

1. Create the `sarathi` user and enable PostGIS (asks for the `postgres` password, then a password for the `sarathi` user):
   ```
   psql -U postgres -h localhost -f backend/db/setup.sql
   ```
   Then create the database as `sarathi`:
   ```
   psql -U sarathi -h localhost -d postgres -c "CREATE DATABASE sarathi;"
   ```
   On Windows, `psql` is in `C:\Program Files\PostgreSQL\18\bin` if it isn't on your PATH.

2. Create `backend/.env` from the example and put the `sarathi` password in it:
   ```
   copy backend\.env.example backend\.env
   ```

3. Create the Python environment and install dependencies:
   ```
   python -m venv .venv
   .venv\Scripts\python -m pip install -r backend\requirements-dev.txt -r pipeline\requirements.txt
   ```

4. Create the tables:
   ```
   cd backend
   ..\.venv\Scripts\python -m alembic upgrade head
   ```

## Importing OpenStreetMap data

Run from the project root:

```
.venv\Scripts\python -m pipeline                    # Kathmandu District + 2 km buffer
.venv\Scripts\python -m pipeline --area kmc         # Kathmandu Metropolitan City only
.venv\Scripts\python -m pipeline --area teku        # small test area, about a minute
.venv\Scripts\python -m pipeline --dry-run          # download and check, but don't touch the database
.venv\Scripts\python -m pipeline --snapshot data\raw\district-20261027T120000Z   # re-run from a saved download
```

Before downloading, the pipeline checks that the database is reachable and has PostGIS and every table and column it writes to (it never creates tables itself; the schema belongs to `backend/`). If something is missing it stops and tells you to run `alembic upgrade head`. `--dry-run` skips this check.

Steps:

1. **Extract**: download the drivable road network and facilities (hospitals, police, pharmacies, fire stations), and save them unchanged as a raw snapshot in `data/raw/`.
2. **Transform**: keep the largest strongly connected part of the road network, set default speeds and travel times, clean facility names, phones and addresses, remove veterinary hospitals, and merge facilities mapped twice.
3. **Validate**: stop before loading if the data looks wrong (too few roads, broken edges, no hospitals).
4. **Load**: copy into staging tables, then replace the live road network and OSM facilities in one transaction, and link each facility to its nearest road node. Facilities edited by moderators (`source = 'manual'`) are never overwritten. Every run is recorded in `import_runs`.

## Routing engine

`backend/app/routing/` holds the routing engine, written from scratch:

- `graph.py` loads `road_nodes` and `road_edges` into memory as a compact adjacency list (about 1 s for Kathmandu District).
- `search.py` has one search function, `find_route`, that runs Dijkstra or A* (`algorithm="dijkstra" | "astar"`) for the shortest (`weight="length"`) or fastest (`weight="time"`) route. A* uses the straight-line distance (divided by the top speed in the graph for fastest routes), which never overestimates, so both algorithms return the same optimal cost.

Benchmark Dijkstra against A* on random routes in the imported network (run from `backend/`):

```
..\.venv\Scripts\python -m app.routing.benchmark --pairs 100 --weight time --csv ..\data\benchmarks\time.csv
```

## Tests

```
.venv\Scripts\python -m pytest
```

The database tests in `pipeline/tests/test_load.py` need an empty test database and are skipped otherwise:

```
psql -U sarathi -h localhost -d postgres -c "CREATE DATABASE sarathi_test;"
set TEST_DATABASE_URL=postgresql+psycopg://sarathi:PASSWORD@localhost:5432/sarathi_test
.venv\Scripts\python -m pytest
```

Map data © OpenStreetMap contributors.
