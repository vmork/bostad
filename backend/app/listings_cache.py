import json
import logging
import os
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.models import AllListingsResponse
from app.scraping.scrape_utils import parse_iso_datetime

logger = logging.getLogger(__name__)


def _normalize_cached_listing(listing: object) -> object:
    if not isinstance(listing, Mapping):
        return listing

    normalized_listing = dict(listing)
    # Legacy cache files can predate the `floor` field becoming part of the API model.
    normalized_listing.setdefault("floor", None)
    return normalized_listing


def _normalize_cached_payload(payload: object) -> object:
    if not isinstance(payload, Mapping):
        return payload

    normalized_payload: dict[str, Any] = dict(payload)
    listings = normalized_payload.get("listings")
    if isinstance(listings, list):
        normalized_payload["listings"] = [
            _normalize_cached_listing(listing) for listing in listings
        ]
    return normalized_payload


def _cache_dir() -> Path:
    return Path(os.getenv("BOSTAD_CACHE_DIR", "/srv/bostad/cache"))


def _cache_payload_path() -> Path:
    return _cache_dir() / "all_listings.json"


def _cache_updated_at_path() -> Path:
    return _cache_dir() / "all_listings.updated_at"


def read_cached_all_listings() -> AllListingsResponse | None:
    logger.info("Attempting to read cached listings from %s", _cache_dir())
    payload_path = _cache_payload_path()
    if not payload_path.exists():
        logger.info("No cached listings found at %s", payload_path)
        return None

    try:
        raw_payload = payload_path.read_text()
        payload = _normalize_cached_payload(json.loads(raw_payload))
        response = AllListingsResponse.model_validate(payload)
    except (OSError, ValidationError, ValueError) as error:
        logger.warning("Failed to read cached listings from %s: %s", payload_path, error)
        return None

    updated_at_path = _cache_updated_at_path()
    if not updated_at_path.exists():
        logger.info("Cached listings exist but no cached updated_at found at %s", updated_at_path)
        return response

    try:
        updated_at = parse_iso_datetime(updated_at_path.read_text())
    except OSError as error:
        logger.warning("Failed to read cached updated_at from %s: %s", updated_at_path, error)
        return response

    if updated_at is None:
        logger.warning("Cached updated_at value in %s is not valid ISO datetime", updated_at_path)
        return response

    return response.model_copy(update={"updated_at": updated_at})
