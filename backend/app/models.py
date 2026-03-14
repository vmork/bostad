from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel
from datetime import datetime
from typing import Literal, Optional as Opt


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
    min: Opt[float] = None
    max: Opt[float] = None


class DateRange(CamelModel):
    min: Opt[datetime] = None
    max: Opt[datetime] = None


class QueuePosition(CamelModel):
    my_position: Opt[int] = None
    total: Opt[int] = None
    oldest_queue_dates: Opt[list[datetime]] = (
        None  # sorted array of oldest queue dates, olest first
    )
    has_good_chance: Opt[bool] = None


class TenantRequirements(CamelModel):
    student: bool
    age_range: Opt[Range] = None
    income_range: Opt[Range] = None
    num_tenants_range: Opt[Range] = None


class ListingFeatures(CamelModel):
    # should always be available in json response
    balcony: Opt[bool] = None
    elevator: Opt[bool] = None
    new_production: Opt[bool] = None

    # not in json but can be scraped from listing page under "Egenskaper"
    kitchen: Opt[bool] = None
    bathroom: Opt[bool] = None
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
    floor: Opt[
        int
    ]  # under "Vaning", can be negative, doesnt exist for multi-apt listings
    rental_period: Opt[DateRange] = None
    coords: Opt[Coordinates] = None
    application_deadline: Opt[datetime] = None
    queue_position: Opt[QueuePosition] = None
    requirements: Opt[TenantRequirements] = None
    date_posted: Opt[datetime] = None
    image_urls: Opt[list[str]] = None
    floorplan_url: Opt[str] = None
    free_text: Opt[str] = None

    # For listings with multiple apartments
    num_apartments: Opt[int] = None
    rent_range: Opt[Range] = None
    area_sqm_range: Opt[Range] = None


class ListingParseError(CamelModel):
    id: str
    reason: str


ApartmentType = Literal["regular", "youth", "student", "senior"]
ListingSource = Literal["bostadsthlm"]


class ListingsSearchOptions(CamelModel):
    """Typed search options for listing fetch requests.

    The API accepts a list to be forward-compatible with multi-source scraping,
    but currently only the single source "bostadsthlm" is supported.

    `max_listings` can be used during debugging to parse only the first N
    listing index items. It defaults to None, which parses all listings.
    """

    sources: list[ListingSource] = Field(default_factory=lambda: ["bostadsthlm"])
    max_listings: Opt[int] = Field(default=None, ge=1)
    cookie: Opt[str] = None

    @field_validator("sources")
    @classmethod
    def _validate_sources(cls, sources: list[ListingSource]) -> list[ListingSource]:
        if not sources:
            raise ValueError("At least one source must be provided")
        if len(sources) != 1:
            raise ValueError("Only one source is currently supported")
        return sources

    @field_validator("cookie")
    @classmethod
    def _normalize_cookie(cls, cookie: Opt[str]) -> Opt[str]:
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

        if (
            len(normalized) >= 2
            and normalized[0] == normalized[-1]
            and normalized[0] in {"'", '"'}
        ):
            normalized = normalized[1:-1].strip()

        normalized = " ".join(normalized.replace("\r", " ").replace("\n", " ").split())
        return normalized or None


ScrapeEventStatus = Literal["started", "progress", "complete", "failed"]


class ScrapeProgress(CamelModel):
    status: ScrapeEventStatus
    current: int
    total: int
    errors: int = 0
    logged_in: Opt[bool] = None
    listing_id: Opt[str] = None
    source: Opt[ListingSource] = None
    message: Opt[str] = None


class AllListingsResponse(CamelModel):
    listings: list[Listing]
    errors: list[ListingParseError]
    logged_in: Opt[bool] = None


class ListingsStreamEvent(CamelModel):
    event: ScrapeEventStatus
    progress: ScrapeProgress
    data: Opt[AllListingsResponse] = None
