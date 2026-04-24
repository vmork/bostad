from datetime import datetime
from typing import Any, TypeVar

from app.models import CamelModel, ListingSources


class ListingParseException(Exception):
    """Raised when a listing cannot be parsed."""


class ListingsFetchException(Exception):
    """Raised when a source listing index cannot be fetched."""


CamelModelType = TypeVar("CamelModelType", bound=CamelModel)


def build_source_scoped_id(source: ListingSources, source_local_id: str) -> str:
    """Build a globally unique listing identifier from source-local data."""

    return f"{source}:{source_local_id}"


def scraped_updates(scraped_data: CamelModel) -> dict[str, Any]:
    """Return typed non-null scraped fields for safe model_copy updates."""

    updates: dict[str, Any] = {}
    for field_name in type(scraped_data).model_fields:
        value = getattr(scraped_data, field_name)
        if value is not None:
            updates[field_name] = value
    return updates


def dedupe_keep_order(items: list[str]) -> list[str]:
    return list(dict.fromkeys(items))


def parse_iso_datetime(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.strip())
    except ValueError:
        return None


def parse_numeric_text(value: str) -> float | None:
    """Parse numbers that may contain spaces or suffix text."""

    digits = "".join(character for character in value if character.isdigit())
    if not digits:
        return None
    return float(digits)


def parse_optional_int(value: Any) -> int | None:
    """Best-effort integer parsing for queue and stats fields."""

    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        digits = "".join(character for character in value if character.isdigit())
        if digits:
            return int(digits)
    return None
