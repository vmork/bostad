from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

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


class AllocationMethod(StrEnum):
    QUEUE_POINTS = "queue_points"
    RANDOM = "random"
    APPLICATION_DATE = "application_date"
    MANUAL_REQUEST = "manual_request"
    UNKNOWN = "unknown"


class FurnishingLevel(StrEnum):
    FULL = "full"
    PARTIAL = "partial"
    NONE = "none"


class AllocationInfo(CamelModel):
    allocation_method: AllocationMethod | None = None
    my_position: int | None = None
    total: int | None = None
    oldest_queue_dates: list[datetime] | None = (
        None  # sorted array of oldest queue dates, oldest first
    )
    has_good_chance: bool | None = None


class TenantRequirements(CamelModel):
    student: bool
    age_range: Range | None = None
    income_range: Range | None = None
    num_tenants_range: Range | None = None


ApartmentType = Literal["regular", "youth", "student", "senior"]
LeaseStartDateValue = Literal["asap"] | str
LeaseEndDateValue = Literal["indefinite"] | str


class TenureType(StrEnum):
    FIRST_HAND = "first_hand"
    SECOND_HAND_PRIVATE = "second_hand_private"
    SECOND_HAND_SHARED = "second_hand_shared"


class ListingSources(StrEnum):
    """Supported listing source identifiers shared across the API."""

    BOSTAD_STHLM = "bostadsthlm"
    HOMEQ = "homeq"
    QASA = "qasa"


class ListingSourceStats(CamelModel):
    """Per-source scrape statistics exposed to the frontend."""

    source: ListingSources
    name: str
    global_url: str
    logged_in: bool | None = None
    num_listings: int = 0
    num_errors: int = 0


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

    # derived from listing detail page content
    has_viewing: bool | None = None  # true if viewing mentioned, false if explicitly negated
    has_pictures: bool = False
    num_pictures: int = 0
    has_floorplan: bool = False


class Listing(CamelModel):
    # Source identity
    id: str
    source: ListingSources
    source_local_id: str

    # Required listing data
    url: str
    name: str  # eg "Herrhagsvägen 137"
    loc_municipality: str  # eg "Stockholm"
    loc_district: str  # eg "Enskede"
    rent: float  # minimum rent for multi-ap listings
    area_sqm: float  # minimum area for multi-ap listings
    num_rooms: float  # minimum number of rooms for multi-ap listings
    apartment_type: ApartmentType
    furnishing: FurnishingLevel | None = None
    tenure_type: TenureType | None = None
    features: ListingFeatures = Field(default_factory=ListingFeatures)

    # Misc
    floor: (
        float | None
    )  # under "Vaning", can be negative or fractional, absent only for multi-apt listings
    lease_start_date: LeaseStartDateValue | None = None
    lease_end_date: LeaseEndDateValue | None = None
    coords: Coordinates | None = None
    application_deadline_date: datetime | None = None
    allocation_info: AllocationInfo | None = None
    requirements: TenantRequirements | None = None
    date_posted: datetime | None = None
    image_urls: list[str] | None = None
    floorplan_url: str | None = None
    free_text: str | None = None
    district_id: int | None = None  # assigned by server-side PIP from coords

    # For listings with multiple apartments
    num_apartments: int | None = None
    rent_range: Range | None = None
    area_sqm_range: Range | None = None
    floor_range: Range | None = None  # floor range for multi-apartment listings

    @field_validator("lease_start_date", mode="before")
    @classmethod
    def _normalize_lease_start_date(cls, value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.date().isoformat()
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        raise TypeError("Unsupported lease_start_date value")

    @field_validator("lease_end_date", mode="before")
    @classmethod
    def _normalize_lease_end_date(cls, value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.date().isoformat()
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        raise TypeError("Unsupported lease_end_date value")


class ListingParseError(CamelModel):
    id: str
    source: ListingSources
    source_local_id: str
    url: str | None = None
    reason: str


def _normalize_cookie_value(cookie: str | None) -> str | None:
    """Normalize user-provided cookie input from UI/curl snippets."""

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


class BostadSthlmSearchOptions(CamelModel):
    """Source-specific search options for bostad.stockholm.se."""

    max_listings: int | None = Field(default=None, ge=1)
    cookie: str | None = None

    @field_validator("cookie")
    @classmethod
    def _normalize_cookie(cls, cookie: str | None) -> str | None:
        return _normalize_cookie_value(cookie)


class HomeQSearchOptions(CamelModel):
    """Source-specific search options for HomeQ."""

    max_listings: int | None = Field(default=None, ge=1)
    # TODO: auth cookie


class QasaSearchOptions(CamelModel):
    """Source-specific search options for Qasa."""

    max_listings: int | None = Field(default=None, ge=1)


class ListingsSearchOptions(CamelModel):
    """Typed search options for listing fetch requests.

    `sources` selects which sources to scrape in one combined request, while
    each source can expose its own nested option object.
    """

    sources: list[ListingSources] = Field(
        default_factory=lambda: [
            ListingSources.BOSTAD_STHLM,
            ListingSources.HOMEQ,
            ListingSources.QASA,
        ]
    )
    bostadsthlm: BostadSthlmSearchOptions | None = None
    homeq: HomeQSearchOptions | None = None
    qasa: QasaSearchOptions | None = None

    @field_validator("sources")
    @classmethod
    def _dedupe_sources(cls, sources: list[ListingSources]) -> list[ListingSources]:
        return list(dict.fromkeys(sources))


ScrapeEventStatus = Literal["started", "progress", "complete", "failed"]


class ScrapeProgress(CamelModel):
    status: ScrapeEventStatus
    current: int
    total: int
    errors: int = 0
    listing_id: str | None = None
    source: ListingSources | None = None
    source_stats: list[ListingSourceStats] = Field(default_factory=list)
    message: str | None = None


class AllListingsResponse(CamelModel):
    listings: list[Listing]
    errors: list[ListingParseError]
    source_stats: list[ListingSourceStats] = Field(default_factory=list)
    updated_at: datetime | None = None


class ListingsStreamEvent(CamelModel):
    event: ScrapeEventStatus
    progress: ScrapeProgress
    data: AllListingsResponse | None = None
