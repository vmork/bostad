import re
from datetime import datetime
from typing import Any, Optional as Opt
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
    ListingsSearchOptions,
    QueuePosition,
    Range,
    TenantRequirements,
)
from app.scraping.types import ProgressCallback

BOSTAD_STHLM_BASE_PATH = "https://bostad.stockholm.se"
IMAGE_HREF_RE = re.compile(r"\.(?:jpe?g|png|webp|gif)(?:$|\?)", re.IGNORECASE)
DATE_RE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
LISTINGS_TIMEOUT = httpx.Timeout(20.0, connect=10.0)
DETAIL_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


class ListingParseException(Exception):
    """Raised when a listing cannot be parsed."""


class ListingsFetchException(Exception):
    """Raised when the listings index cannot be fetched."""


# ----- Listing Merge Helpers -----


def _scraped_updates(scraped_data: "_ScrapedListingPageData") -> dict[str, Any]:
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


def _parse_iso_datetime(value: str) -> Opt[datetime]:
    try:
        return datetime.fromisoformat(value.strip())
    except ValueError:
        return None


def _extract_image_urls(soup: BeautifulSoup) -> Opt[list[str]]:
    slider = soup.select_one(".image-slider")
    if slider is None:
        return None

    image_urls = [
        _absolute_url(href)
        for anchor in slider.select("a[href]")
        if (href := _attribute_as_str(anchor.get("href")))
        and IMAGE_HREF_RE.search(href)
    ]
    image_urls = _dedupe_keep_order(image_urls)
    return image_urls or None


def _extract_floorplan_url(soup: BeautifulSoup) -> Opt[str]:
    for anchor in soup.select("a[href]"):
        href = _attribute_as_str(anchor.get("href"))
        link_text = " ".join(
            part for part in [
                anchor.get_text(" ", strip=True),
                _attribute_as_str(anchor.get("aria-label")),
                href,
            ]
            if part
        )
        if href and "planritning" in link_text.lower():
            return _absolute_url(href)

    return None


def _extract_free_text(soup: BeautifulSoup) -> Opt[str]:
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
            text
            for item in container.select("li")
            if (text := item.get_text(" ", strip=True))
        )

    return items


def _extract_requirements(soup: BeautifulSoup) -> Opt[TenantRequirements]:
    requirement_items = _extract_requirement_items(soup)
    if not requirement_items:
        return None

    student = False
    age_min: Opt[float] = None
    age_max: Opt[float] = None
    income_min: Opt[float] = None
    num_tenants_max: Opt[float] = None

    for item in requirement_items:
        item_lower = item.lower()
        if "studentvillkor" in item_lower:
            student = True

        if match := re.search(r"Lägsta tillåtna ålder:\s*(\d+)", item, re.IGNORECASE):
            age_min = float(match.group(1))
        if match := re.search(r"Högsta tillåtna ålder:\s*(\d+)", item, re.IGNORECASE):
            age_max = float(match.group(1))
        if match := re.search(r"Lägsta årsinkomst:\s*(\d+)", item, re.IGNORECASE):
            income_min = float(match.group(1))
        if match := re.search(
            r"Max antal hushållsmedlemmar:\s*(\d+)", item, re.IGNORECASE
        ):
            num_tenants_max = float(match.group(1))

    has_structured_requirements = (
        any(
            value is not None
            for value in [age_min, age_max, income_min, num_tenants_max]
        )
        or student
    )
    if not has_structured_requirements:
        return None

    age_range = (
        Range(min=age_min, max=age_max)
        if age_min is not None or age_max is not None
        else None
    )
    income_range = Range(min=income_min) if income_min is not None else None
    num_tenants_range = (
        Range(max=num_tenants_max) if num_tenants_max is not None else None
    )
    return TenantRequirements(
        student=student,
        age_range=age_range,
        income_range=income_range,
        num_tenants_range=num_tenants_range,
    )


def _extract_queue_position(soup: BeautifulSoup) -> Opt[QueuePosition]:
    for section in soup.select(".info-section"):
        heading = section.find("strong")
        if heading is None or heading.get_text(" ", strip=True) != "Kötider":
            continue

        queue_times_sorted = []
        for item in section.select(".queue-list .u-list-disc li"):
            date_text = item.get_text(" ", strip=True)
            if not DATE_RE.fullmatch(date_text):
                continue

            parsed_date = _parse_iso_datetime(date_text)
            if parsed_date is not None:
                queue_times_sorted.append(parsed_date)

        if queue_times_sorted:
            return QueuePosition(queue_times_sorted=queue_times_sorted)

    return None


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
        else (
            "youth"
            if data.get("Ungdom")
            else "senior" if data.get("Senior") else "regular"
        )
    )
    num_apartments = data.get("Antal")
    rent_range = Range(min=data.get("LägstaHyran"), max=data.get("HögstaHyran"))
    area_sqm_range = Range(min=data.get("LägstaYtan"), max=data.get("HögstaYtan"))
    date_posted = data.get("AnnonseradFran")
    application_deadline = data.get("AnnonseradTill")

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
        coords=coords,
        date_posted=date_posted,
        application_deadline=application_deadline,
        num_apartments=num_apartments,
        rent_range=rent_range,
        area_sqm_range=area_sqm_range,
    )


class _ScrapedListingPageData(CamelModel):
    rental_period: Opt[DateRange] = None
    queue_position: Opt[QueuePosition] = None
    requirements: Opt[TenantRequirements] = None
    image_urls: Opt[list[str]] = None
    floorplan_url: Opt[str] = None
    free_text: Opt[str] = None


def _scrape_listing_html(html: str) -> _ScrapedListingPageData:
    soup = BeautifulSoup(html, "html.parser")
    return _ScrapedListingPageData(
        queue_position=_extract_queue_position(soup),
        requirements=_extract_requirements(soup),
        image_urls=_extract_image_urls(soup),
        floorplan_url=_extract_floorplan_url(soup),
        free_text=_extract_free_text(soup),
    )


async def _fetch_listing_html(client: httpx.AsyncClient, url: str) -> str:
    print(f"Fetching listing page for {url}...")
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
        raise ListingParseException(
            f"Failed to fetch {listing.url}: {error}"
        ) from error

    return listing.model_copy(update=_scraped_updates(scraped_data))


async def scrape_all_listings(
    progress_callback: Opt[ProgressCallback] = None,
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
    progress_callback: Opt[ProgressCallback] = None,
) -> AllListingsResponse:
    """New typed entrypoint used by API handlers with JSON search options."""
    from app.scraping.core import scrape_source_listings
    from app.scraping.sources.bostadsthlm import BostadSthlmSource

    return await scrape_source_listings(
        source=BostadSthlmSource(),
        options=options,
        progress_callback=progress_callback,
    )
