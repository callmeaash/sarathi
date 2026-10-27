import argparse
import logging
import sys
from datetime import datetime, timezone

from sqlalchemy import create_engine

from pipeline import settings
from pipeline.extract import (
    area_polygon, configure_osmnx, download_facilities, download_roads, load_snapshot, save_snapshot,
)
from pipeline.load import run_import
from pipeline.schema import SchemaError, check_schema
from pipeline.transform import transform
from pipeline.validate import validate

log = logging.getLogger("pipeline")


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    """Parse and check the command-line arguments."""
    parser = argparse.ArgumentParser(prog="python -m pipeline",
                                     description="Import OpenStreetMap roads and facilities into PostGIS.")
    parser.add_argument("--area", choices=settings.AREAS, default="district")
    parser.add_argument("--buffer-m", type=float, default=settings.DEFAULT_BUFFER_M,
                        help="extra distance around the boundary, so routes near the edge still work")
    parser.add_argument("--snapshot", help="reuse a saved raw snapshot folder instead of downloading")
    parser.add_argument("--dry-run", action="store_true",
                        help="extract, transform and validate, but do not write to the database")
    args = parser.parse_args(argv)
    if args.buffer_m < 0:
        parser.error("--buffer-m must not be negative")
    return args


def main(argv: list[str] | None = None) -> int:
    """Run extract, transform, validate and load, and return the exit code."""
    args = parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    logging.getLogger("pyogrio").setLevel(logging.WARNING)
    started_at = datetime.now(timezone.utc)
    configure_osmnx()

    engine = None
    if not args.dry_run:
        # Check the database before a long download, not after it.
        try:
            engine = create_engine(settings.database_url())
            check_schema(engine)
        except (RuntimeError, SchemaError) as exc:
            log.error("%s", exc)
            return 1

    if args.snapshot:
        graph, raw_facilities, meta = load_snapshot(args.snapshot)
        area = settings.AREAS[meta["area"]]
        snapshot = args.snapshot
        log.info("loaded snapshot %s (%s, downloaded %s)", snapshot, area.name, meta["downloaded_at"])
    else:
        area = settings.AREAS[args.area]
        if area.osm_relation:
            log.info("downloading %s (OSM relation %d) with a %.0f m buffer",
                     area.label, area.osm_relation, args.buffer_m)
        else:
            log.info("downloading %s: %d m around %s", area.label, area.radius_m, area.center)
        polygon = area_polygon(area, args.buffer_m)
        graph = download_roads(polygon)
        raw_facilities = download_facilities(polygon)
        snapshot = str(save_snapshot(graph, raw_facilities, area, args.buffer_m))
        log.info("saved raw snapshot to %s", snapshot)

    data = transform(graph, raw_facilities)
    log.info("roads: %d nodes, %d edges (dropped %d nodes outside the main connected network)",
             len(data.nodes), len(data.edges), data.dropped_nodes)
    kinds = data.facilities["kind"].value_counts().to_dict() if len(data.facilities) else {}
    log.info("facilities: %d %s", len(data.facilities), kinds)

    report = validate(data.nodes, data.edges, data.facilities, area.min_nodes)
    for warning in report.warnings:
        log.warning(warning)
    if not report.ok:
        for error in report.errors:
            log.error(error)
        log.error("validation failed, nothing was loaded")
        return 1
    if args.dry_run:
        log.info("dry run: validation passed, database not changed")
        return 0

    result = run_import(engine, data, area.name, snapshot, started_at)
    log.info("loaded into the database: %s", result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
