"""Geographic point-in-polygon lookup for canonical listing location fields.

Loads the district GeoJSON once at import time and builds a shapely STRtree
spatial index for fast coordinate lookups. District polygons already carry the
district name plus a municipality identifier, so scrapers can keep source
strings as a fallback while the backend normalizes names from geometry when a
point falls inside the known polygons.
"""

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from shapely import STRtree
from shapely.geometry import shape
from shapely.geometry.point import Point

logger = logging.getLogger(__name__)

# Resolve GeoJSON relative to the project root (one level above backend/app/)
_DISTRICT_GEOJSON_PATH = (
    Path(__file__).resolve().parent.parent.parent / "data" / "sthlm-stadsdelar.geojson"
)
_MUNICIPALITY_GEOJSON_PATH = (
    Path(__file__).resolve().parent.parent.parent / "data" / "sthlm-kommuner.geojson"
)


@dataclass(frozen=True, slots=True)
class GeoResolvedLocation:
    """Canonical location names and IDs resolved from point-in-polygon data."""

    district_id: int
    district_name: str
    municipality_id: str
    municipality_name: str | None


# Parallel arrays: _geometries[i] has metadata stored at the same index.
_geometries: list[Any] = []
_district_ids: list[int] = []
_district_names: list[str] = []
_district_municipality_ids: list[str] = []
_municipality_names_by_id: dict[str, str] = {}
_tree: STRtree | None = None


def _normalize_municipality_id(municipality_id: str | None) -> str | None:
    """Collapse Stockholm's subdivided ids like 0180-7 to municipality id 0180."""

    if municipality_id is None:
        return None
    return municipality_id.split("-", maxsplit=1)[0]


def _load_municipality_names() -> None:
    """Load municipality names keyed by normalized municipality id."""

    with open(_MUNICIPALITY_GEOJSON_PATH) as f:
        data = json.load(f)

    for feature in data["features"]:
        properties = feature.get("properties", {})
        raw_id = properties.get("municipality_id")
        if raw_id is None:
            continue

        municipality_id = str(raw_id)
        if municipality_id.startswith("0180-"):
            _municipality_names_by_id["0180"] = "Stockholm"
            continue

        normalized_id = _normalize_municipality_id(municipality_id)
        name = properties.get("name")
        if normalized_id is None or not isinstance(name, str) or not name:
            continue
        _municipality_names_by_id.setdefault(normalized_id, name)

    _municipality_names_by_id.setdefault("0180", "Stockholm")


def _load() -> None:
    """Parse GeoJSON and build the spatial index."""
    global _tree
    _load_municipality_names()

    with open(_DISTRICT_GEOJSON_PATH) as f:
        data = json.load(f)
    for feature in data["features"]:
        geom = shape(feature["geometry"])
        if not geom.is_valid:
            continue

        properties = feature.get("properties", {})
        district_id = properties.get("stadsdel_id")
        district_name = properties.get("name")
        municipality_id = _normalize_municipality_id(properties.get("municipality_id"))
        if (
            not isinstance(district_id, int)
            or not isinstance(district_name, str)
            or not district_name
            or municipality_id is None
        ):
            continue

        _geometries.append(geom)
        _district_ids.append(district_id)
        _district_names.append(district_name)
        _district_municipality_ids.append(municipality_id)

    _tree = STRtree(_geometries)
    logger.info(f"Loaded {len(_geometries)} district polygons from {_DISTRICT_GEOJSON_PATH.name}")


# Load on import so the index is ready when scraping starts
_load()


def lookup_location(lat: float, long: float) -> GeoResolvedLocation | None:
    """Return canonical district and municipality data for a coordinate."""

    if _tree is None:
        return None

    point = Point(long, lat)  # shapely uses (x=lon, y=lat) order
    candidates = _tree.query(point)
    for idx in candidates:
        if _geometries[idx].contains(point):
            municipality_id = _district_municipality_ids[idx]
            return GeoResolvedLocation(
                district_id=_district_ids[idx],
                district_name=_district_names[idx],
                municipality_id=municipality_id,
                municipality_name=_municipality_names_by_id.get(municipality_id),
            )
    return None


def lookup_district(lat: float, long: float) -> int | None:
    """Return the district_id for a coordinate, or None if outside all districts."""
    resolved = lookup_location(lat, long)
    return resolved.district_id if resolved is not None else None
