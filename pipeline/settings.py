import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

PROJECT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
CACHE_DIR = DATA_DIR / "cache"

load_dotenv(PROJECT_DIR / "backend" / ".env")

WGS84 = "EPSG:4326"
PROJECTED_CRS = "EPSG:32645"  # UTM zone 45N, metres; covers the Kathmandu valley


@dataclass(frozen=True)
class Area:
    name: str
    label: str
    # Administrative boundary by OSM relation id. Free-text place names are not used: Nominatim matched
    # "Kathmandu District" to the District Attorney's Office building.
    osm_relation: int | None = None
    min_area_km2: float = 0.0                  # sanity check for the downloaded boundary
    center: tuple[float, float] | None = None  # (lat, lon) for small test areas
    radius_m: int = 0
    min_nodes: int = 1


AREAS = {
    "district": Area("district", "Kathmandu District", osm_relation=4583247, min_area_km2=350, min_nodes=10_000),
    "kmc": Area("kmc", "Kathmandu Metropolitan City", osm_relation=12394677, min_area_km2=40, min_nodes=5_000),
    "teku": Area("teku", "Teku test area", center=(27.6950, 85.3040), radius_m=1500, min_nodes=300),
}
DEFAULT_BUFFER_M = 2000

# Typical speeds in Kathmandu traffic, not legal limits. Only ~3% of roads carry maxspeed.
SPEEDS_KPH = {
    "motorway": 50,
    "trunk": 40,
    "primary": 35,
    "secondary": 30,
    "tertiary": 25,
    "unclassified": 20,
    "residential": 20,
    "road": 20,
    "living_street": 10,
}
FALLBACK_SPEED_KPH = 20

EXTRA_WAY_TAGS = ["name:en"]

FACILITY_KINDS = ("hospital", "police", "pharmacy", "fire_station")
FACILITY_TAGS = {"amenity": list(FACILITY_KINDS)}
VETERINARY_PATTERN = r"veterin|animal|पशु"
DEDUPE_RADIUS_M = 150


def database_url() -> str:
    url = os.getenv("PIPELINE_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set. Copy backend/.env.example to backend/.env and fill it in.")
    return url
