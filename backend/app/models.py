from pydantic import BaseModel, ConfigDict
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
    queue_times_sorted: Opt[list[datetime]] = None
    has_good_chance: Opt[bool] = None

class TenantRequirements(CamelModel):
    student: bool
    age_range: Opt[Range] = None
    income_range: Opt[Range] = None
    num_tenants_range: Opt[Range] = None

ApartmentType = Literal["regular", "youth", "student", "senior"]

class Listing(CamelModel): 
    # Required
    id              : str
    url             : str
    name            : str            # eg "Herrhagsvägen 137"
    loc_municipality: str            # eg "Stockholm"
    loc_district    : str            # eg "Enskede"
    rent            : float          # minimum rent for multi-ap listings
    area_sqm        : float          # minimum area for multi-ap listings
    num_rooms       : float          # minimum number of rooms for multi-ap listings
    apartment_type  : ApartmentType

    # Misc
    rental_period        : Opt[DateRange]          = None
    coords               : Opt[Coordinates]        = None
    application_deadline : Opt[datetime]           = None
    queue_position       : Opt[QueuePosition]      = None
    requirements         : Opt[TenantRequirements] = None
    date_posted          : Opt[datetime]           = None
    image_urls           : Opt[list[str]]          = None
    floorplan_url        : Opt[str]                = None
    free_text            : Opt[str]                = None

    # For listings with multiple apartments
    num_apartments: Opt[int]    = None
    rent_range    : Opt[Range]  = None
    area_sqm_range: Opt[Range]  = None

class ListingParseError(CamelModel):
    id     : str
    reason : str


ScrapeEventStatus = Literal["started", "progress", "complete", "failed"]


class ScrapeProgress(CamelModel):
    status: ScrapeEventStatus
    current: int
    total: int
    errors: int = 0
    listing_id: Opt[str] = None
    message: Opt[str] = None
    
class AllListingsResponse(CamelModel):
    listings: list[Listing]
    errors  : list[ListingParseError]


class ListingsStreamEvent(CamelModel):
    event: ScrapeEventStatus
    progress: ScrapeProgress
    data: Opt[AllListingsResponse] = None