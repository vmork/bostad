from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base model that converts snake_case to camelCase in JSON."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class Coordinates(CamelModel):
    lat: float
    long: float


class Range(CamelModel):
    min: float | None = None
    max: float | None = None


class DateRange(CamelModel):
    min: datetime | None = None
    max: datetime | None = None


class QueuePosition(CamelModel):
    my_position: int | None = None
    total: int | None = None
    oldest_queue_dates: list[datetime] | None = (
        None  # sorted array of oldest queue dates, olest first
    )
    has_good_chance: bool | None = None


class TenantRequirements(CamelModel):
    student: bool
    age_range: Range | None = None
    income_range: Range | None = None
    num_tenants_range: Range | None = None


class ListingFeatures(CamelModel):
    # should always be available in json response
    balcony: bool | None = None
    elevator: bool | None = None
    new_production: bool | None = None

    # not in json but can be scraped from listing page under "Egenskaper"
    kitchen: bool | None = None
    bathroom: bool | None = None
    # if these are not present, assume not available
    dishwasher: bool = False
    washing_machine: bool = False
    dryer: bool = False


class Listing(CamelModel):
    # Required
    id: str
    url: str
    name: str  # eg "Herrhagsvägen 137"
    loc_municipality: str  # eg "Stockholm"
    loc_district: str  # eg "Enskede"
    rent: float  # minimum rent for multi-ap listings
    area_sqm: float  # minimum area for multi-ap listings
    num_rooms: float  # minimum number of rooms for multi-ap listings
    apartment_type: ApartmentType
    features: ListingFeatures = Field(default_factory=ListingFeatures)

    # Misc
    floor: float | None  # under "Vaning", can be negative or fractional, absent only for multi-apt listings
    rental_period: DateRange | None = None
    coords: Coordinates | None = None
    application_deadline: datetime | None = None
    queue_position: QueuePosition | None = None
    requirements: TenantRequirements | None = None
    date_posted: datetime | None = None
    image_urls: list[str] | None = None
    floorplan_url: str | None = None
    free_text: str | None = None

    # For listings with multiple apartments
    num_apartments: int | None = None
    rent_range: Range | None = None
    area_sqm_range: Range | None = None




class ListingParseError(CamelModel):
    id: str
    url: str|None = None
    reason: str


ApartmentType = Literal["regular", "youth", "student", "senior"]


class ListingSources(StrEnum):
    """Supported listing source identifiers shared across the API."""

    BOSTAD_STHLM = "bostadsthlm"


class ListingsSearchOptions(CamelModel):
    """Typed search options for listing fetch requests.

    The API accepts a list to be forward-compatible with multi-source scraping,
    but currently only one built-in source is supported.

    `max_listings` can be used during debugging to parse only the first N
    listing index items. It defaults to None, which parses all listings.
    """

    sources: list[ListingSources] = Field(default_factory=lambda: [ListingSources.BOSTAD_STHLM])
    max_listings: int | None = Field(default=None, ge=1)
    cookie: str | None = None

    @field_validator("sources")
    @classmethod
    def _validate_sources(cls, sources: list[ListingSources]) -> list[ListingSources]:
        if not sources:
            raise ValueError("At least one source must be provided")
        if len(sources) != 1:
            raise ValueError("Only one source is currently supported")
        return sources

    @field_validator("cookie")
    @classmethod
    def _normalize_cookie(cls, cookie: str | None) -> str | None:
        """Normalize user-provided cookie input from UI/curl snippets.

        We accept plain cookie strings and also tolerate common pasted forms,
        such as a leading "Cookie:" prefix or a quoted value.
        """
        if cookie is None:
            return None

        normalized = cookie.strip()
        if not normalized:
            return None

        if normalized.lower().startswith("cookie:"):
            normalized = normalized.split(":", 1)[1].strip()

        if normalized.startswith("-b "):
            normalized = normalized[3:].strip()

        if len(normalized) >= 2 and normalized[0] == normalized[-1] and normalized[0] in {"'", '"'}:
            normalized = normalized[1:-1].strip()

        normalized = " ".join(normalized.replace("\r", " ").replace("\n", " ").split())
        return normalized or None


ScrapeEventStatus = Literal["started", "progress", "complete", "failed"]


class ScrapeProgress(CamelModel):
    status: ScrapeEventStatus
    current: int
    total: int
    errors: int = 0
    logged_in: bool | None = None
    listing_id: str | None = None
    source: ListingSources | None = None
    message: str | None = None


class AllListingsResponse(CamelModel):
    listings: list[Listing]
    errors: list[ListingParseError]
    logged_in: bool | None = None


class ListingsStreamEvent(CamelModel):
    event: ScrapeEventStatus
    progress: ScrapeProgress
    data: AllListingsResponse | None = None
