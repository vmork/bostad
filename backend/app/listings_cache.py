import logging
import os
from pathlib import Path

from pydantic import ValidationError

from app.models import AllListingsResponse
from app.scraping.scrape_utils import parse_iso_datetime

logger = logging.getLogger(__name__)


def _cache_dir() -> Path:
    return Path(os.getenv("BOSTAD_CACHE_DIR", "/srv/bostad/cache"))


def _cache_payload_path() -> Path:
    return _cache_dir() / "all_listings.json"


def _cache_updated_at_path() -> Path:
    return _cache_dir() / "all_listings.updated_at"


def read_cached_all_listings() -> AllListingsResponse | None:
    payload_path = _cache_payload_path()
    if not payload_path.exists():
        return None

    try:
        response = AllListingsResponse.model_validate_json(payload_path.read_text())
    except (OSError, ValidationError, ValueError) as error:
        logger.warning("Failed to read cached listings from %s: %s", payload_path, error)
        return None

    updated_at_path = _cache_updated_at_path()
    if not updated_at_path.exists():
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