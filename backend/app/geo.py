"""Geographic point-in-polygon lookup for assigning district IDs to listings.

Loads the stadsdelar (district) GeoJSON once at import time and builds a
shapely STRtree spatial index for fast coordinate → district_id lookups.
"""

import json
import logging
from pathlib import Path

from shapely import STRtree
from shapely.geometry import shape
from shapely.geometry.point import Point

logger = logging.getLogger(__name__)

# Resolve GeoJSON relative to the project root (one level above backend/app/)
_GEOJSON_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "sthlm-stadsdelar.geojson"

# Parallel arrays: _geometries[i] has district id _district_ids[i]
_geometries: list = []
_district_ids: list[int] = []
_tree: STRtree | None = None


def _load() -> None:
    """Parse GeoJSON and build the spatial index."""
    global _tree
    with open(_GEOJSON_PATH) as f:
        data = json.load(f)
    for feature in data["features"]:
        geom = shape(feature["geometry"])
        if not geom.is_valid:
            continue
        _geometries.append(geom)
        _district_ids.append(feature["properties"]["stadsdel_id"])
    _tree = STRtree(_geometries)
    logger.info(f"Loaded {len(_geometries)} district polygons from {_GEOJSON_PATH.name}")


# Load on import so the index is ready when scraping starts
_load()


def lookup_district(lat: float, long: float) -> int | None:
    """Return the district_id for a coordinate, or None if outside all districts."""
    if _tree is None:
        return None
    point = Point(long, lat)  # shapely uses (x=lon, y=lat) order
    # Query returns indices of geometries whose bounding box contains the point
    candidates = _tree.query(point)
    for idx in candidates:
        if _geometries[idx].contains(point):
            return _district_ids[idx]
    return None
