# Sarathi

Find open roads in Kathmandu: verified road closures, routes around them, and the nearest hospital by road.

## Project layout

- `backend/` FastAPI app; owns the database schema (`app/models.py`, Alembic migrations)
- `pipeline/` ETL that imports OpenStreetMap roads and facilities into PostGIS
- `frontend/` React web app (mobile-first, with a desktop layout)
- `data/` raw snapshots and download cache (not committed)

## Requirements

- Python 3.12 or newer
- PostgreSQL 18 with PostGIS (installed locally, e.g. with the EDB installer and Stack Builder)
- Node.js 22.12 or newer (for the frontend)

## Setup

1. Create the `sarathi` user and enable PostGIS. Connect as the `postgres` superuser:
   ```
   psql -U postgres -h localhost
   ```
   and run (choose your own password):
   ```sql
   CREATE ROLE sarathi WITH LOGIN CREATEDB PASSWORD 'your-password';
   \connect template1
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
   Enabling PostGIS in `template1` means every database `sarathi` creates has it (only a superuser can enable PostGIS).
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

## Running the API

From `backend/`:

```
..\.venv\Scripts\python -m uvicorn app.main:app --reload
```

The road graph and facilities load into memory at startup (about 1 s). Interactive docs: http://127.0.0.1:8000/docs. Run a single worker: the graph and its closures live in that process's memory.

| Endpoint | What it returns |
|---|---|
| `GET /api/health` | Status and how much map data is loaded |
| `GET /api/route?from_lat&from_lon&to_lat&to_lon&weight=time&algorithm=astar` | Route between two map points that avoids closed roads: distance, time, search stats, the line to draw, the roads it follows (`steps`), and, when closures make it longer, the usual distance and the closures it goes around (`detour`), and reports still waiting for review along it (`unverified`). Routes start and end at the closest spot on the road, respecting one-way streets. `avoid_unverified=true` keeps clear of unverified reports for that route only |
| `GET /api/nearest?lat&lon&kind=hospital&limit=4` | Closest facilities of a kind by road, each with its route line and straight-line distance |
| `GET /api/facilities?bbox=minLon,minLat,maxLon,maxLat&kind=hospital` | Facilities in the visible map area as GeoJSON points (repeat `kind` for several) |
| `GET /api/facilities/{id}?from_lat&from_lon` | Full facility details, plus the road distance from a point if given |
| `GET /api/roads/nearest?lat&lon` | The nearest road's name and the closest spot on it (404 if none within 500 m), e.g. for a dropped pin |
| `GET /api/search?q&lat&lon&limit=8` | Facilities and roads by name for the search box, typo-tolerant (pg_trgm); with a point, each result's distance from it |

### Accounts

| Endpoint | What it does |
|---|---|
| `POST /api/auth/register` | Create an account (`full_name`, `email`, `password`) and email a 6-digit code |
| `POST /api/auth/verify-email` | Confirm the email with the code (needed before reporting hazards) and sign in |
| `POST /api/auth/resend-code` | Send a new verification code |
| `POST /api/auth/login` | Returns an access token (30 min) and sets the session cookie (30 days) |
| `POST /api/auth/refresh` | New access token from the session cookie; the cookie's token is replaced each time |
| `POST /api/auth/logout` | End this session and remove the cookie |
| `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` | Reset the password with an emailed code; ends all sessions |
| `GET /api/me` | The signed-in user (send `Authorization: Bearer <access token>`) |

Rules: passwords are hashed with Argon2; codes expire after 15 minutes, allow 5 wrong tries, can be resent once a minute and at most 5 times an hour; 10 wrong passwords lock the account for 15 minutes; a refresh token that was already swapped coming back signs the user out everywhere (unless it was swapped in the last 10 seconds: that is two tabs refreshing at once, answered with 409 so the tab can retry). The refresh token is kept in an httpOnly, SameSite=Strict cookie limited to `/api/auth`, so page scripts cannot read it; it is HTTPS-only unless `COOKIE_SECURE=false`. Resend and forgot-password give the same answer whether or not the account exists.

With `EMAIL_BACKEND=console` (the default) codes are printed in the API's log instead of being emailed. Set `EMAIL_BACKEND=smtp` and the `SMTP_*` settings in `backend/.env` to send real email.

Make the first moderator (from `backend/`, after they have signed up):

```
..\.venv\Scripts\python -m app.cli set-role someone@example.com moderator
```

### Hazard reports and moderation

| Endpoint | Who | What it does |
|---|---|---|
| `POST /api/incidents` | verified users | Report a hazard: `kind` (landslide, flood, accident, road_blocked, road_works, other), `passable` (no, partly, unsure), optional `note`, `lon`, `lat` |
| `GET /api/incidents?bbox&status` | anyone | Pending and verified reports in the map area (`status=cleared` for past ones) |
| `GET /api/incidents/mine` | signed in | Your own reports and what happened to them, with the reason if rejected |
| `GET /api/incidents/{id}` | anyone | One report (rejected and merged reports are not public) |
| `GET /api/closures` | anyone | Roads closed right now, grouped by hazard, as GeoJSON lines for the map |
| `GET /api/moderation/queue` | moderators | Pending reports, oldest first, with the reporter's record and how many similar reports are nearby |
| `POST /api/incidents/{id}/verify` | moderators | Confirm a report and close every road within `radius_m` (5–200, default 30) |
| `POST /api/incidents/{id}/reject` | moderators | Turn it down with a `reason` the reporter sees |
| `POST /api/incidents/{id}/clear` | moderators | The hazard is gone: reopen its roads |
| `POST /api/incidents/{id}/merge` | moderators | Mark a pending report as a duplicate of `into_id` |
| `GET /api/audit?limit&before_id` | moderators | Every moderator action, newest first |

Rules: reports snap onto the nearest road (the pin must be within 150 m of one); a user can send 10 reports an hour and cannot report the same kind of hazard again within 50 m while the first is waiting. A report is reviewed once: only pending reports can be verified, rejected or merged, and only verified ones cleared. The database is the record of what is closed: at startup the API recomputes the closed roads of every verified hazard from its location and radius, so closures survive restarts and new OSM imports.

Clicked points snap to the nearest road junction (up to 1 km away); points further from any road get a 422 error. `CORS_ORIGINS` (comma separated) sets which front ends may call the API; it defaults to the Vite dev server.

## Routing engine

`backend/app/routing/` holds the routing engine, written from scratch:

- `graph.py` loads `road_nodes` and `road_edges` into memory as a compact adjacency list (about 1 s for Kathmandu District).
- `search.py` has one search function, `find_route`, that runs Dijkstra or A* (`algorithm="dijkstra" | "astar"`) for the shortest (`weight="length"`) or fastest (`weight="time"`) route. A* uses the straight-line distance (divided by the top speed in the graph for fastest routes), which never overestimates, so both algorithms return the same optimal cost.

- `nearest.py` finds the closest facilities of a kind by road: one Dijkstra search outward from the start, collecting facilities as their road nodes are reached. The short stretch between a facility and its nearest road node (`snap_distance_m`) is added to the cost, so the search continues until no unreached facility could still be closer.

- Closures: `graph.close_edges(ids)` / `graph.open_edges(ids)` block and reopen edges in memory (both directions by default), and every search skips closed edges. Each edge keeps a count of active closures, so when two hazards block the same road, clearing one leaves it closed. `closures.edges_near(conn, lon, lat, radius_m)` finds every segment around a hazard with the spatial index, so a flooded bridge closes both carriageways and any parallel bridge, not just one segment.

Benchmark Dijkstra against A* on random routes in the imported network (run from `backend/`):

```
..\.venv\Scripts\python -m app.routing.benchmark --pairs 100 --weight time --csv ..\data\benchmarks\time.csv
```

Measure how often the facility nearest in a straight line is not the nearest by road:

```
..\.venv\Scripts\python -m app.routing.evaluate_nearest --points 500
```

## Frontend

React + TypeScript + Vite, styled with Tailwind using the design tokens from `ui/bato_civic_navigation/DESIGN.md`. Run the API first, then from `frontend/`:

```
npm install
npm run dev
```

Open http://localhost:5173. The map background uses Stadia Maps' "OSM Bright" tiles (OpenStreetMap data with English labels); they work on localhost without an account. For a real domain, add a free Stadia key as `VITE_STADIA_API_KEY` in `frontend/.env.local` (see `frontend/.env.example`). In development Vite forwards `/api` to the API on port 8000 (`SARATHI_API_URL` changes this), so no CORS setup is needed.

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm test` | Unit and component tests (Vitest + Testing Library) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Lint (oxlint) |
| `npm run build` | Production build into `frontend/dist/` |
| `npm run api:types` | Regenerate `src/api/schema.d.ts` from the backend after changing an endpoint |
| `npm run tunnel` | Temporary public HTTPS link to the dev server for testing on a phone anywhere (needs [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/); anyone with the link can use the app while it runs) |

API calls go through `src/api/client.ts`, a client typed from the backend's OpenAPI schema, so a renamed field or a wrong parameter fails the type check instead of failing in the browser.

Sign-in: the access token is kept only in memory and the session in the httpOnly cookie, so nothing secret is stored where page scripts can read it. On load the app restores the session from the cookie; an expired access token is renewed and the request retried automatically. Pages that need an account send visitors to log in and back again afterwards.

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
