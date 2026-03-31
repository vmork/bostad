import logging
import re
from datetime import datetime
from typing import Any
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup, Tag

from app.models import (
    AllListingsResponse,
    ApartmentType,
    CamelModel,
    Coordinates,
    DateRange,
    Listing,
    ListingFeatures,
    ListingsSearchOptions,
    QueuePosition,
    Range,
    TenantRequirements,
)
from app.scraping.types import ProgressCallback

BOSTAD_STHLM_BASE_PATH = "https://bostad.stockholm.se"
LISTINGS_TIMEOUT = httpx.Timeout(30.0, connect=15.0)
DETAIL_TIMEOUT = httpx.Timeout(10.0, connect=5.0)

IMAGE_HREF_RE = re.compile(r"\.(?:jpe?g|png|webp|gif)(?:$|\?)", re.IGNORECASE)
DATE_RE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
NEGATION_PREFIXES = ("ej ", "inte ", "ingen ", "inget ", "utan ", "saknar ")
logger = logging.getLogger(__name__)


class ListingParseException(Exception):
    """Raised when a listing cannot be parsed."""


class ListingsFetchException(Exception):
    """Raised when the listings index cannot be fetched."""


# ----- Listing Merge Helpers -----


def _scraped_updates(scraped_data: _ScrapedListingPageData) -> dict[str, Any]:
    """Return typed non-null scraped fields for safe Listing model updates.

    We intentionally avoid model_dump() here, because model_copy(update=...) does not
    validate update payloads and nested models (for example requirements) can become
    plain dicts, causing pydantic serialization warnings later.
    """

    updates: dict[str, Any] = {}
    for field_name in _ScrapedListingPageData.model_fields:
        value = getattr(scraped_data, field_name)
        if value is not None:
            updates[field_name] = value
    return updates


def _absolute_url(url: str) -> str:
    return urljoin(BOSTAD_STHLM_BASE_PATH, url)


def _attribute_as_str(value: Any) -> str:
    return value if isinstance(value, str) else ""


def _dedupe_keep_order(items: list[str]) -> list[str]:
    return list(dict.fromkeys(items))


def _parse_iso_datetime(value: str) -> datetime|None:
    try:
        return datetime.fromisoformat(value.strip())
    except ValueError:
        return None


def _parse_numeric_text(value: str) -> float|None:
    """Parse numbers that may contain spaces or suffix text, e.g. '600 000 kronor'."""
    digits = re.sub(r"\D", "", value)
    if not digits:
        return None
    return float(digits)


def _extract_image_urls(soup: BeautifulSoup) -> list[str]|None:
    slider = soup.select_one(".image-slider")
    if slider is None:
        return None

    image_urls = [
        _absolute_url(href)
        for anchor in slider.select("a[href]")
        if (href := _attribute_as_str(anchor.get("href"))) and IMAGE_HREF_RE.search(href)
    ]
    image_urls = _dedupe_keep_order(image_urls)
    return image_urls or None


def _extract_floorplan_url(soup: BeautifulSoup) -> str|None:
    for anchor in soup.select("a[href]"):
        href = _attribute_as_str(anchor.get("href"))
        link_text = " ".join(
            part
            for part in [
                anchor.get_text(" ", strip=True),
                _attribute_as_str(anchor.get("aria-label")),
                href,
            ]
            if part
        )
        if href and "planritning" in link_text.lower():
            return _absolute_url(href)

    return None


def _extract_free_text(soup: BeautifulSoup) -> str|None:
    content = soup.select_one(".main-body__content")
    if content is None:
        return None

    parts = []
    for element in content.find_all(["h3", "p", "li"]):
        text = element.get_text(" ", strip=True)
        if text:
            parts.append(text)

    free_text = "\n\n".join(parts)
    return free_text or None


def _extract_requirement_items(soup: BeautifulSoup) -> list[str]:
    items: list[str] = []
    for heading in soup.find_all("h3"):
        heading_text = heading.get_text(" ", strip=True)
        if heading_text not in {
            "Villkor för att anmäla intresse",
            "Villkor för att skriva kontrakt",
        }:
            continue

        container = heading.parent if isinstance(heading.parent, Tag) else None
        if container is None:
            continue

        items.extend(
            text for item in container.select("li") if (text := item.get_text(" ", strip=True))
        )

    return items


def _extract_requirements(soup: BeautifulSoup) -> TenantRequirements|None:
    requirement_items = _extract_requirement_items(soup)
    page_text = soup.get_text(" ", strip=True)
    if not requirement_items and not page_text:
        return None

    student = False
    age_min: float|None = None
    age_max: float|None = None
    income_min: float|None = None
    num_tenants_max: float|None = None

    for item in requirement_items:
        item_lower = item.lower()
        if "studentvillkor" in item_lower:
            student = True

        if match := re.search(r"Lägsta tillåtna ålder\s*:?\s*(\d+)", item, re.IGNORECASE):
            age_min = float(match.group(1))
        if match := re.search(r"Högsta tillåtna ålder\s*:?\s*(\d+)", item, re.IGNORECASE):
            age_max = float(match.group(1))
        if match := re.search(r"Lägsta årsinkomst\s*:?\s*([\d\s]+)", item, re.IGNORECASE):
            parsed_income = _parse_numeric_text(match.group(1))
            if parsed_income is not None:
                income_min = parsed_income
        if match := re.search(
            r"Max antal hushållsmedlemmar\s*:?\s*([\d\s]+)",
            item,
            re.IGNORECASE,
        ):
            parsed_max_tenants = _parse_numeric_text(match.group(1))
            if parsed_max_tenants is not None:
                num_tenants_max = parsed_max_tenants

    # Youth listings often encode the age interval in descriptive text
    # ('mellan 18 och 30 år') instead of only the structured requirement list.
    if (age_min is None or age_max is None) and (match := re.search(r"mellan\s+(\d+)\s+och\s+(\d+)\s*år", page_text, re.IGNORECASE)):
        if age_min is None:
            age_min = float(match.group(1))
        if age_max is None:
            age_max = float(match.group(2))

    has_structured_requirements = (
        any(value is not None for value in [age_min, age_max, income_min, num_tenants_max])
        or student
    )
    if not has_structured_requirements:
        return None

    age_range = (
        Range(min=age_min, max=age_max) if age_min is not None or age_max is not None else None
    )
    income_range = Range(min=income_min) if income_min is not None else None
    num_tenants_range = Range(max=num_tenants_max) if num_tenants_max is not None else None
    return TenantRequirements(
        student=student,
        age_range=age_range,
        income_range=income_range,
        num_tenants_range=num_tenants_range,
    )


def _extract_queue_position(soup: BeautifulSoup) -> QueuePosition|None:
    my_position: int|None = None
    total: int|None = None

    # Logged-in listing pages expose queue position in the dedicated
    # "preliminär köplats" widget.
    for counter in soup.select(".preliminar-plats-counter"):
        counter_text = " ".join(counter.get_text(" ", strip=True).split())
        counter_match = re.search(
            r"([\d\s]+)\s*(?:av|/)\s*([\d\s]+)",
            counter_text,
            re.IGNORECASE,
        )
        if counter_match is None:
            continue

        parsed_my_position = _parse_optional_int(counter_match.group(1))
        parsed_total = _parse_optional_int(counter_match.group(2))
        if parsed_my_position is not None and parsed_total is not None:
            my_position = parsed_my_position
            total = parsed_total
            break

    oldest_queue_dates: list[datetime] = []

    for section in soup.select(".info-section"):
        heading = section.find("strong")
        if heading is None or heading.get_text(" ", strip=True) != "Kötider":
            continue

        for item in section.select(".queue-list .u-list-disc li"):
            date_text = item.get_text(" ", strip=True)
            if not DATE_RE.fullmatch(date_text):
                continue

            parsed_date = _parse_iso_datetime(date_text)
            if parsed_date is not None:
                oldest_queue_dates.append(parsed_date)

        # sort, oldest first
        oldest_queue_dates.sort()

        section_text = section.get_text(" ", strip=True)
        section_text_normalized = " ".join(section_text.split())

        # Logged-in pages include queue position under labels like
        # "Preliminär köplats: 12 av 345".
        prelim_match = re.search(
            r"prelimin[aä]r\s+k[öo]plats\s*:?\s*([\d\s]+)\s*(?:av|/)\s*([\d\s]+)",
            section_text_normalized,
            re.IGNORECASE,
        )
        if prelim_match is not None and my_position is None:
            parsed_my_position = _parse_optional_int(prelim_match.group(1))
            parsed_total = _parse_optional_int(prelim_match.group(2))
            if parsed_my_position is not None:
                my_position = parsed_my_position
            if parsed_total is not None:
                total = parsed_total

        if total is None:
            total_match = re.search(
                r"(?:antal\s+intresseanm[aä]lningar|totalt\s+i\s+k[öo]n)\s*:?\s*([\d\s]+)",
                section_text_normalized,
                re.IGNORECASE,
            )
            if total_match is not None:
                parsed_total = _parse_optional_int(total_match.group(1))
                if parsed_total is not None:
                    total = parsed_total

        break

    if oldest_queue_dates or my_position is not None or total is not None:
        return QueuePosition(
            my_position=my_position,
            total=total,
            oldest_queue_dates=oldest_queue_dates or None,
        )

    return None


def _parse_optional_int(value: Any) -> int|None:
    """Best-effort integer parsing for queue fields that may be strings."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        digits = re.sub(r"\D", "", value)
        if digits:
            return int(digits)
    return None


def _extract_queue_signals_from_json(data: dict[str, Any]) -> QueuePosition|None:
    """Extract queue signals available in index JSON.

    Currently only HarBraChans is used from JSON. Queue position values are
    parsed from the listing detail HTML ("Preliminär köplats").
    """
    has_good_chance_raw = data.get("HarBraChans")
    has_good_chance = bool(has_good_chance_raw) if isinstance(has_good_chance_raw, bool) else None

    if has_good_chance is None:
        return None

    return QueuePosition(
        has_good_chance=has_good_chance,
    )


def _normalize_feature_label(label: str) -> str:
    """Normalize labels from the Egenskaper list for stable matching."""
    return " ".join(label.strip().lower().split())


def _extract_feature_labels(soup: BeautifulSoup) -> list[str]:
    """Extract normalized labels under the Egenskaper section."""
    for heading in soup.find_all("h2"):
        if heading.get_text(" ", strip=True).lower() != "egenskaper":
            continue

        container = heading.parent if isinstance(heading.parent, Tag) else None
        if container is None:
            return []

        return [
            _normalize_feature_label(text)
            for item in container.select("li")
            if (text := item.get_text(" ", strip=True))
        ]

    return []


def _is_explicit_negative_feature(label: str, keyword: str) -> bool:
    if keyword not in label:
        return False
    return any(label.startswith(prefix) for prefix in NEGATION_PREFIXES)


def _extract_html_listing_features(soup: BeautifulSoup) -> ListingFeatures:
    """Parse feature signals only available on listing detail pages.

    Balcony/elevator/new production are intentionally not derived from HTML,
    because they are already present in the listing index JSON payload.
    """

    labels = _extract_feature_labels(soup)

    kitchen: bool|None = None
    if any(_is_explicit_negative_feature(label, "kök") for label in labels):
        kitchen = False
    elif any("kök" in label for label in labels):
        kitchen = True

    bathroom: bool|None = None
    if any(_is_explicit_negative_feature(label, "badrum") for label in labels):
        bathroom = False
    elif any("badrum" in label for label in labels):
        bathroom = True

    # "Förberett för installation ..." means the appliance is not installed yet.
    dishwasher = any(
        "diskmaskin" in label and "förberett" not in label and "installation" not in label
        for label in labels
    )
    washing_machine = any(
        "tvättmaskin" in label and "förberett" not in label and "installation" not in label
        for label in labels
    )
    dryer = any(
        "torktumlare" in label and "förberett" not in label and "installation" not in label
        for label in labels
    )

    return ListingFeatures(
        kitchen=kitchen,
        bathroom=bathroom,
        dishwasher=dishwasher,
        washing_machine=washing_machine,
        dryer=dryer,
    )


def _scrape_listing_json(data: dict[str, Any]) -> Listing:
    listing_id = str(data.get("AnnonsId", "unknown"))
    try:
        name = data["Gatuadress"]
        url = f"{BOSTAD_STHLM_BASE_PATH}{data['Url']}"
        loc_municipality = data["Kommun"]
        loc_district = data["Stadsdel"]
        rent = data["Hyra"] or data["LägstaHyran"]
        area_sqm = data["Yta"] or data["LägstaYtan"]
        num_rooms = data["AntalRum"] or data["LägstaAntalRum"]
    except KeyError as error:
        raise ListingParseException(
            f"Missing required key {error} for listing {listing_id}"
        ) from error

    lat, lng = data.get("KoordinatLatitud"), data.get("KoordinatLongitud")
    coords = Coordinates(lat=lat, long=lng) if lat and lng else None
    apartment_type: ApartmentType = (
        "student"
        if data.get("Student")
        else ("youth" if data.get("Ungdom") else "senior" if data.get("Senior") else "regular")
    )
    num_apartments = data.get("Antal")
    rent_range = Range(min=data.get("LägstaHyran"), max=data.get("HögstaHyran"))
    area_sqm_range = Range(min=data.get("LägstaYtan"), max=data.get("HögstaYtan"))
    date_posted = data.get("AnnonseradFran")
    application_deadline = data.get("AnnonseradTill")
    floor = data.get("Vaning")
    queue_position = _extract_queue_signals_from_json(data)
    features = ListingFeatures(
        balcony=data.get("Balkong"),
        elevator=data.get("Hiss"),
        new_production=data.get("Nyproduktion"),
    )

    return Listing(
        id=listing_id,
        url=url,
        name=name,
        loc_municipality=loc_municipality,
        loc_district=loc_district,
        rent=rent,
        area_sqm=area_sqm,
        num_rooms=num_rooms,
        apartment_type=apartment_type,
        floor=floor,
        features=features,
        queue_position=queue_position,
        coords=coords,
        date_posted=date_posted,
        application_deadline=application_deadline,
        num_apartments=num_apartments,
        rent_range=rent_range,
        area_sqm_range=area_sqm_range,
    )


class _ScrapedListingPageData(CamelModel):
    rental_period: DateRange|None = None
    queue_position: QueuePosition|None = None
    requirements: TenantRequirements|None = None
    image_urls: list[str]|None = None
    floorplan_url: str|None = None
    free_text: str|None = None
    features: ListingFeatures|None = None


def _scrape_listing_html(html: str) -> _ScrapedListingPageData:
    soup = BeautifulSoup(html, "html.parser")
    return _ScrapedListingPageData.model_validate({
        "queue_position": _extract_queue_position(soup),
        "requirements": _extract_requirements(soup),
        "image_urls": _extract_image_urls(soup),
        "floorplan_url": _extract_floorplan_url(soup),
        "free_text": _extract_free_text(soup),
        "features": _extract_html_listing_features(soup),
    })


async def _fetch_listing_html(client: httpx.AsyncClient, url: str) -> str:
    response = await client.get(url, timeout=DETAIL_TIMEOUT)
    response.raise_for_status()

    return response.text


async def parse_listing_async(
    data: dict[str, Any], client: httpx.AsyncClient, include_html: bool = True
) -> Listing:
    listing = _scrape_listing_json(data)

    if not include_html:
        return listing

    try:
        html = await _fetch_listing_html(client, listing.url)
        scraped_data = _scrape_listing_html(html)
    except httpx.HTTPError as error:
        raise ListingParseException(f"Failed to fetch {listing.url}: {error}") from error

    # Sometimes student apartments are not marked as such in the listing index, but the detail
    # page makes it clear, so we override the apartment type if student requirements are found.
    if scraped_data.requirements and scraped_data.requirements.student:
        listing.apartment_type = "student"

    # Merge only HTML-exclusive feature flags onto JSON-derived features.
    if scraped_data.features is not None:
        listing.features = listing.features.model_copy(
            update=scraped_data.features.model_dump(
                include={
                    "kitchen",
                    "bathroom",
                    "dishwasher",
                    "washing_machine",
                    "dryer",
                }
            )
        )

    # Queue details come from both JSON (HarBraChans) and HTML queue section.
    # Preserve JSON signals and augment with HTML position/date fields.
    if scraped_data.queue_position is not None:
        if listing.queue_position is None:
            listing.queue_position = scraped_data.queue_position
        else:
            listing.queue_position = listing.queue_position.model_copy(
                update={
                    "my_position": (
                        scraped_data.queue_position.my_position
                        if scraped_data.queue_position.my_position is not None
                        else listing.queue_position.my_position
                    ),
                    "total": (
                        scraped_data.queue_position.total
                        if scraped_data.queue_position.total is not None
                        else listing.queue_position.total
                    ),
                    "oldest_queue_dates": (
                        scraped_data.queue_position.oldest_queue_dates
                        if scraped_data.queue_position.oldest_queue_dates is not None
                        else listing.queue_position.oldest_queue_dates
                    ),
                }
            )

    scraped_updates = _scraped_updates(scraped_data)
    scraped_updates.pop("features", None)
    scraped_updates.pop("queue_position", None)
    return listing.model_copy(update=scraped_updates)


async def scrape_all_listings(
    progress_callback: ProgressCallback|None = None,
) -> AllListingsResponse:
    from app.scraping.core import scrape_source_listings
    from app.scraping.sources.bostadsthlm import BostadSthlmSource

    return await scrape_source_listings(
        source=BostadSthlmSource(),
        options=ListingsSearchOptions(),
        progress_callback=progress_callback,
    )


async def scrape_all_listings_with_options(
    options: ListingsSearchOptions,
    progress_callback: ProgressCallback|None = None,
) -> AllListingsResponse:
    """New typed entrypoint used by API handlers with JSON search options."""
    from app.scraping.core import scrape_source_listings
    from app.scraping.sources.bostadsthlm import BostadSthlmSource

    return await scrape_source_listings(
        source=BostadSthlmSource(),
        options=options,
        progress_callback=progress_callback,
    )
