import logging
import re
import time
from datetime import datetime
from typing import Any
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup, Tag

from app.models import (
    AllocationMethod,
    ApartmentType,
    BostadSthlmSearchOptions,
    CamelModel,
    Coordinates,
    LeaseEndDateValue,
    LeaseStartDateValue,
    Listing,
    ListingFeatures,
    ListingSources,
    ListingSourceStats,
    ListingsSearchOptions,
    AllocationInfo,
    Range,
    TenantRequirements,
    TenureType,
)
from app.scraping.scrape_utils import (
    ListingParseException,
    ListingsFetchException,
    build_source_scoped_id,
    dedupe_keep_order,
    parse_iso_datetime,
    parse_numeric_text,
    parse_optional_int,
    scraped_updates,
)
from app.scraping.types import ListingSource

logger = logging.getLogger(__name__)


BOSTAD_STHLM_BASE_PATH = "https://bostad.stockholm.se"
INDEX_TIMEOUT = httpx.Timeout(30.0, connect=15.0)
LISTING_TIMEOUT = httpx.Timeout(10.0, connect=5.0)

IMAGE_HREF_RE = re.compile(r"\.(?:jpe?g|png|webp|gif)(?:$|\?)", re.IGNORECASE)
DATE_RE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
FLOOR_RANGE_RE = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*(?:-\s*(\d+(?:[.,]\d+)?))?\s*tr",
    re.IGNORECASE,
)
VIEWING_NEGATION_RE = re.compile(
    r"(?:inte|ingen|ej)\s+(?:att\s+)?(?:visas|visning|ha\s+någon\s+visning)",
    re.IGNORECASE,
)
VIEWING_POSITIVE_RE = re.compile(
    r"(?:öppen\s+visning|inbjuden\s+till\s+visning|visning\s+(?:av|i|på|den))",
    re.IGNORECASE,
)
NEGATION_PREFIXES = ("ej ", "inte ", "ingen ", "inget ", "utan ", "saknar ")
CONTRACT_START_RE = re.compile(r"Från:\s*([^\s<]+)", re.IGNORECASE)
CONTRACT_END_RE = re.compile(r"Till:\s*([^\s<]+)", re.IGNORECASE)
LEASE_START_ASAP_MARKERS = {"asap", "snarast"}
LEASE_END_INDEFINITE_MARKERS = {"tillsvidare", "tills_vidare", "indefinite"}
DATE_NULL_MARKERS = {"undefined"}


# Browser-like defaults used by both index and detail requests.
DEFAULT_HEADERS = {
    "Accept": "*/*",
    "Accept-Language": "sv-SE,sv;q=0.9,en-SG;q=0.8,en;q=0.7,en-US;q=0.6",
    "Connection": "keep-alive",
    "DNT": "1",
    "Referer": "https://bostad.stockholm.se/bostad",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
}


class _ScrapedListingPageData(CamelModel):
    lease_start_date: LeaseStartDateValue | None = None
    lease_end_date: LeaseEndDateValue | None = None
    queue_position: AllocationInfo | None = None
    requirements: TenantRequirements | None = None
    image_urls: list[str] | None = None
    floorplan_url: str | None = None
    free_text: str | None = None
    features: ListingFeatures | None = None
    floor_range: Range | None = None


def _absolute_url(url: str) -> str:
    return urljoin(BOSTAD_STHLM_BASE_PATH, url)


def _attribute_as_str(value: Any) -> str:
    return value if isinstance(value, str) else ""


def _extract_image_urls(soup: BeautifulSoup) -> list[str] | None:
    slider = soup.select_one(".image-slider")
    if slider is None:
        return None

    image_urls = [
        _absolute_url(href)
        for anchor in slider.select("a[href]")
        if (href := _attribute_as_str(anchor.get("href"))) and IMAGE_HREF_RE.search(href)
    ]
    image_urls = dedupe_keep_order(image_urls)
    return image_urls or None


def _extract_floorplan_url(soup: BeautifulSoup) -> str | None:
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


def _extract_free_text(soup: BeautifulSoup) -> str | None:
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


def _extract_apartment_fact_value(soup: BeautifulSoup, label: str) -> str | None:
    normalized_label = label.strip().lower()
    for label_el in soup.select(".apartment-facts__text"):
        if label_el.get_text(strip=True).lower() != normalized_label:
            continue

        value_el = label_el.find_next_sibling(class_="apartment-facts__heading")
        if value_el is None:
            continue

        value = value_el.get_text(" ", strip=True)
        return value or None

    return None


def _parse_listing_date_value(value: str | None) -> datetime | None:
    if value is None:
        return None

    normalized = value.strip()
    if not normalized:
        return None

    if normalized.lower().replace(" ", "_") in DATE_NULL_MARKERS:
        return None

    return parse_iso_datetime(normalized)


def _parse_lease_start_value(value: str | None) -> LeaseStartDateValue | None:
    if value is None:
        return None

    normalized = value.strip()
    if not normalized:
        return None

    marker = normalized.lower().replace(" ", "_")
    if marker in LEASE_START_ASAP_MARKERS:
        return "asap"
    if marker in DATE_NULL_MARKERS or marker in LEASE_END_INDEFINITE_MARKERS:
        return None

    parsed = parse_iso_datetime(normalized)
    return parsed.date().isoformat() if parsed is not None else None


def _parse_lease_end_value(value: str | None) -> LeaseEndDateValue | None:
    if value is None:
        return None

    normalized = value.strip()
    if not normalized:
        return None

    marker = normalized.lower().replace(" ", "_")
    if marker in LEASE_END_INDEFINITE_MARKERS:
        return "indefinite"
    if marker in DATE_NULL_MARKERS or marker in LEASE_START_ASAP_MARKERS:
        return None

    parsed = parse_iso_datetime(normalized)
    return parsed.date().isoformat() if parsed is not None else None


def _extract_lease_dates(
    soup: BeautifulSoup,
) -> tuple[LeaseStartDateValue | None, LeaseEndDateValue | None]:
    fact_start_date = _parse_lease_start_value(_extract_apartment_fact_value(soup, "Inflytt"))
    contract_text = _extract_section_text(soup, "Om kontraktet")
    contract_start = CONTRACT_START_RE.search(contract_text)
    contract_end = CONTRACT_END_RE.search(contract_text)

    lease_start_date = (
        _parse_lease_start_value(contract_start.group(1))
        if contract_start is not None
        else fact_start_date
    )
    lease_end_date = (
        _parse_lease_end_value(contract_end.group(1)) if contract_end is not None else None
    )
    return lease_start_date, lease_end_date


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

        # Logged-out pages render requirements as list items, while logged-in pages
        # wrap each requirement in accordion headers with status icons.
        items.extend(
            text
            for item in container.select("li, .js-accordion__header")
            if (text := item.get_text(" ", strip=True))
        )

    return items


def _extract_section_text(soup: BeautifulSoup, heading_text: str) -> str:
    normalized_heading = heading_text.strip().lower()
    for heading in soup.find_all(["h2", "h3"]):
        if heading.get_text(" ", strip=True).strip().lower() != normalized_heading:
            continue

        parts: list[str] = []
        for sibling in heading.next_siblings:
            if isinstance(sibling, Tag) and sibling.name and sibling.name.startswith("h"):
                break

            text = (
                sibling.get_text(" ", strip=True)
                if isinstance(sibling, Tag)
                else str(sibling).strip()
            )
            if text:
                parts.append(text)

        return " ".join(parts)

    return ""


def _extract_requirements(soup: BeautifulSoup) -> TenantRequirements | None:
    requirement_items = _extract_requirement_items(soup)
    housing_type_text = _extract_section_text(soup, "Typ av bostad")
    page_text = soup.get_text(" ", strip=True)
    if not requirement_items and not page_text:
        return None

    student = False
    age_min: float | None = None
    age_max: float | None = None
    income_min: float | None = None
    num_tenants_max: float | None = None

    for item in requirement_items:
        item_lower = item.lower()
        if "studentvillkor" in item_lower:
            student = True

        if match := re.search(r"Lägsta tillåtna ålder\s*:?\s*(\d+)", item, re.IGNORECASE):
            age_min = float(match.group(1))
        if match := re.search(r"Högsta tillåtna ålder\s*:?\s*(\d+)", item, re.IGNORECASE):
            age_max = float(match.group(1))
        if match := re.search(r"Lägsta årsinkomst\s*:?\s*([\d\s]+)", item, re.IGNORECASE):
            parsed_income = parse_numeric_text(match.group(1))
            if parsed_income is not None:
                income_min = parsed_income
        if match := re.search(
            r"Max antal hushållsmedlemmar\s*:?\s*([\d\s]+)",
            item,
            re.IGNORECASE,
        ):
            parsed_max_tenants = parse_numeric_text(match.group(1))
            if parsed_max_tenants is not None:
                num_tenants_max = parsed_max_tenants

    if (age_min is None or age_max is None) and (
        match := re.search(
            r"mellan\s+(\d+)\s+och\s+(\d+)\s*år",
            housing_type_text,
            re.IGNORECASE,
        )
    ):
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


def _extract_queue_position(soup: BeautifulSoup) -> AllocationInfo | None:
    my_position: int | None = None
    total: int | None = None
    oldest_queue_dates: list[datetime] = []

    for counter in soup.select(".preliminar-plats-counter"):
        counter_text = " ".join(counter.get_text(" ", strip=True).split())
        counter_match = re.search(
            r"([\d\s]+)\s*(?:av|/)\s*([\d\s]+)",
            counter_text,
            re.IGNORECASE,
        )
        if counter_match is None:
            continue

        parsed_my_position = parse_optional_int(counter_match.group(1))
        parsed_total = parse_optional_int(counter_match.group(2))
        if parsed_my_position is not None and parsed_total is not None:
            my_position = parsed_my_position
            total = parsed_total
            break

    for section in soup.select(".info-section"):
        heading = section.find("strong")
        if heading is None or heading.get_text(" ", strip=True) != "Kötider":
            continue

        for item in section.select(".queue-list .u-list-disc li"):
            date_text = item.get_text(" ", strip=True)
            if not DATE_RE.fullmatch(date_text):
                continue

            parsed_date = parse_iso_datetime(date_text)
            if parsed_date is not None:
                oldest_queue_dates.append(parsed_date)

        oldest_queue_dates.sort()
        section_text = section.get_text(" ", strip=True)
        section_text_normalized = " ".join(section_text.split())

        prelim_match = re.search(
            r"prelimin[aä]r\s+k[öo]plats\s*:?\s*([\d\s]+)\s*(?:av|/)\s*([\d\s]+)",
            section_text_normalized,
            re.IGNORECASE,
        )
        if prelim_match is not None and my_position is None:
            parsed_my_position = parse_optional_int(prelim_match.group(1))
            parsed_total = parse_optional_int(prelim_match.group(2))
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
                parsed_total = parse_optional_int(total_match.group(1))
                if parsed_total is not None:
                    total = parsed_total

        break

    if oldest_queue_dates or my_position is not None or total is not None:
        return AllocationInfo(
            my_position=my_position,
            total=total,
            oldest_queue_dates=oldest_queue_dates or None,
            allocation_method=AllocationMethod.QUEUE_POINTS,
        )

    return None


def _extract_queue_signals_from_json(data: dict[str, Any]) -> AllocationInfo:
    has_good_chance_raw = data.get("HarBraChans")
    has_good_chance = bool(has_good_chance_raw) if isinstance(has_good_chance_raw, bool) else None
    return AllocationInfo(
        has_good_chance=has_good_chance,
        allocation_method=AllocationMethod.QUEUE_POINTS,
    )


def _normalize_feature_label(label: str) -> str:
    return " ".join(label.strip().lower().split())


def _extract_feature_labels(soup: BeautifulSoup) -> list[str]:
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
    labels = _extract_feature_labels(soup)

    kitchen: bool | None = None
    if any(_is_explicit_negative_feature(label, "kök") for label in labels):
        kitchen = False
    elif any("kök" in label for label in labels):
        kitchen = True

    bathroom: bool | None = None
    if any(_is_explicit_negative_feature(label, "badrum") for label in labels):
        bathroom = False
    elif any("badrum" in label for label in labels):
        bathroom = True

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


def _parse_floor_value(raw: str) -> float:
    return float(raw.replace(",", "."))


def _extract_floor_range(soup: BeautifulSoup) -> Range | None:
    for label_el in soup.select(".apartment-facts__text"):
        if label_el.get_text(strip=True).lower() != "våning":
            continue

        value_el = label_el.find_next_sibling(class_="apartment-facts__heading")
        if value_el is None:
            continue

        value_text = value_el.get_text(" ", strip=True)
        match = FLOOR_RANGE_RE.search(value_text)
        if match is None:
            continue

        floor_min = _parse_floor_value(match.group(1))
        floor_max = _parse_floor_value(match.group(2)) if match.group(2) else floor_min
        return Range(min=floor_min, max=floor_max)

    return None


def _extract_has_viewing(soup: BeautifulSoup) -> bool | None:
    heading = soup.find("h3", id="visningsinformation")
    if heading is None:
        for h3 in soup.find_all("h3"):
            if h3.get_text(strip=True).lower() == "visningsinformation":
                heading = h3
                break
    if heading is None:
        return None

    parts: list[str] = []
    for sibling in heading.next_siblings:
        if isinstance(sibling, Tag) and sibling.name and sibling.name.startswith("h"):
            break
        text = (
            sibling.get_text(" ", strip=True) if isinstance(sibling, Tag) else str(sibling).strip()
        )
        if text:
            parts.append(text)

    section_text = " ".join(parts)
    if not section_text:
        return None

    has_positive = bool(VIEWING_POSITIVE_RE.search(section_text))
    has_negation = bool(VIEWING_NEGATION_RE.search(section_text))
    return not has_negation or has_positive


def _scrape_listing_json(data: dict[str, Any]) -> Listing:
    source_local_id = str(data.get("AnnonsId", "unknown"))
    try:
        name = data["Gatuadress"]
        url = f"{BOSTAD_STHLM_BASE_PATH}{data['Url']}"
        loc_municipality = data["Kommun"]
        loc_district = data["Stadsdel"]
        lat, lng = data["KoordinatLatitud"], data["KoordinatLongitud"]
        rent = data["Hyra"] or data["LägstaHyran"]
        area_sqm = data["Yta"] or data["LägstaYtan"]
        num_rooms = data["AntalRum"] or data["LägstaAntalRum"]
    except KeyError as error:
        raise ListingParseException(
            f"Missing required key {error} for listing {source_local_id}"
        ) from error

    apartment_type: ApartmentType = (
        "student"
        if data.get("Student")
        else ("youth" if data.get("Ungdom") else "senior" if data.get("Senior") else "regular")
    )
    coords = Coordinates(lat=lat, long=lng) if lat is not None and lng is not None else None
    num_apartments = data.get("Antal")
    rent_range = Range(min=data.get("LägstaHyran"), max=data.get("HögstaHyran"))
    area_sqm_range = Range(min=data.get("LägstaYtan"), max=data.get("HögstaYtan"))
    date_posted = (
        parse_iso_datetime(str(data.get("AnnonseradFran"))) if data.get("AnnonseradFran") else None
    )
    application_deadline_date = (
        parse_iso_datetime(str(data.get("AnnonseradTill"))) if data.get("AnnonseradTill") else None
    )
    floor = data.get("Vaning")
    queue_position = _extract_queue_signals_from_json(data)
    features = ListingFeatures(
        balcony=data.get("Balkong"),
        elevator=data.get("Hiss"),
        new_production=data.get("Nyproduktion"),
    )

    return Listing(
        id=build_source_scoped_id(ListingSources.BOSTAD_STHLM, source_local_id),
        source=ListingSources.BOSTAD_STHLM,
        source_local_id=source_local_id,
        url=url,
        name=name,
        loc_municipality=loc_municipality,
        loc_district=loc_district,
        coords=coords,
        rent=rent,
        area_sqm=area_sqm,
        num_rooms=num_rooms,
        apartment_type=apartment_type,
        tenure_type=TenureType.FIRST_HAND,
        floor=floor,
        features=features,
        allocation_info=queue_position,
        date_posted=date_posted,
        application_deadline_date=application_deadline_date,
        num_apartments=num_apartments,
        rent_range=rent_range,
        area_sqm_range=area_sqm_range,
    )


def _scrape_listing_html(html: str) -> _ScrapedListingPageData:
    soup = BeautifulSoup(html, "html.parser")
    features = _extract_html_listing_features(soup)
    features.has_viewing = _extract_has_viewing(soup)
    lease_start_date, lease_end_date = _extract_lease_dates(soup)
    return _ScrapedListingPageData.model_validate({
        "lease_start_date": lease_start_date,
        "lease_end_date": lease_end_date,
        "queue_position": _extract_queue_position(soup),
        "requirements": _extract_requirements(soup),
        "image_urls": _extract_image_urls(soup),
        "floorplan_url": _extract_floorplan_url(soup),
        "free_text": _extract_free_text(soup),
        "features": features,
        "floor_range": _extract_floor_range(soup),
    })


async def _fetch_listing_html(client: httpx.AsyncClient, url: str) -> str:
    response = await client.get(url, timeout=LISTING_TIMEOUT)
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

    if scraped_data.requirements and scraped_data.requirements.student:
        listing.apartment_type = "student"

    if scraped_data.features is not None:
        listing.features = listing.features.model_copy(
            update=scraped_data.features.model_dump(
                include={
                    "kitchen",
                    "bathroom",
                    "dishwasher",
                    "washing_machine",
                    "dryer",
                    "has_viewing",
                }
            )
        )

    if scraped_data.queue_position is not None:
        if listing.allocation_info is None:
            listing.allocation_info = scraped_data.queue_position
        else:
            listing.allocation_info = listing.allocation_info.model_copy(
                update={
                    "my_position": (
                        scraped_data.queue_position.my_position
                        if scraped_data.queue_position.my_position is not None
                        else listing.allocation_info.my_position
                    ),
                    "total": (
                        scraped_data.queue_position.total
                        if scraped_data.queue_position.total is not None
                        else listing.allocation_info.total
                    ),
                    "oldest_queue_dates": (
                        scraped_data.queue_position.oldest_queue_dates
                        if scraped_data.queue_position.oldest_queue_dates is not None
                        else listing.allocation_info.oldest_queue_dates
                    ),
                    "allocation_method": (
                        scraped_data.queue_position.allocation_method
                        if scraped_data.queue_position.allocation_method is not None
                        else listing.allocation_info.allocation_method
                    ),
                }
            )

    if (
        listing.floor is None
        and scraped_data.floor_range is not None
        and scraped_data.floor_range.max is not None
    ):
        listing.floor = scraped_data.floor_range.max
    listing.floor_range = scraped_data.floor_range

    next_updates = scraped_updates(scraped_data)
    next_updates.pop("features", None)
    next_updates.pop("queue_position", None)
    next_updates.pop("floor_range", None)
    listing = listing.model_copy(update=next_updates)

    listing.features = listing.features.model_copy(
        update={
            "has_pictures": listing.image_urls is not None and len(listing.image_urls) > 0,
            "num_pictures": len(listing.image_urls) if listing.image_urls is not None else 0,
            "has_floorplan": listing.floorplan_url is not None,
        }
    )

    return listing


class BostadSthlmSource(ListingSource):
    """Source implementation for bostad.stockholm.se listings."""

    source_id: ListingSources = ListingSources.BOSTAD_STHLM
    name = "Bostadsförmedlingen"
    global_url = BOSTAD_STHLM_BASE_PATH
    detail_fetch_concurrency = 12

    def _get_options(self, options: ListingsSearchOptions) -> BostadSthlmSearchOptions:
        return options.bostadsthlm or BostadSthlmSearchOptions()

    def configure_client(
        self,
        client: httpx.AsyncClient,
        options: ListingsSearchOptions,
    ) -> None:
        source_options = self._get_options(options)
        client.headers.update(DEFAULT_HEADERS)

        cookie_preview = f"{source_options.cookie[:24]}..." if source_options.cookie else None
        logger.info(
            f"[{self.source_id}] Starting scrape with options: "
            f"max_listings={source_options.max_listings}, cookie={cookie_preview}[...] (len={len(source_options.cookie) if source_options.cookie else 0})"
        )

        if source_options.cookie:
            client.headers["Cookie"] = source_options.cookie
        else:
            logger.info(f"[{self.source_id}] No cookie provided; fetching index anonymously")

    def infer_logged_in(self, items: list[dict[str, Any]]) -> bool | None:
        if not items:
            return None

        first_index_item = items[0]
        if not isinstance(first_index_item, dict):
            return None

        raw_logged_in = first_index_item.get("ArInloggad")
        return raw_logged_in if isinstance(raw_logged_in, bool) else None

    def limit_index_items(
        self,
        items: list[dict[str, Any]],
        options: ListingsSearchOptions,
    ) -> list[dict[str, Any]]:
        limit = self._get_options(options).max_listings
        return items[:limit] if limit is not None else items

    def build_source_stats(
        self,
        *,
        logged_in: bool | None,
        num_listings: int,
        num_errors: int,
    ) -> ListingSourceStats:
        return ListingSourceStats(
            source=self.source_id,
            name=self.name,
            global_url=self.global_url,
            logged_in=logged_in,
            num_listings=num_listings,
            num_errors=num_errors,
        )

    async def fetch_listing_index(
        self,
        client: httpx.AsyncClient,
        options: ListingsSearchOptions,
    ) -> list[dict[str, Any]]:
        if self.source_id not in options.sources:
            raise ValueError(f"Unsupported source: {options.sources[0]}")

        index_url = urljoin(BOSTAD_STHLM_BASE_PATH, "AllaAnnonser/")
        logger.info(f"[{self.source_id}] Fetching listings index from {index_url}")
        started_at = time.time()
        try:
            response = await client.get(
                index_url,
                timeout=INDEX_TIMEOUT,
            )
            response.raise_for_status()
        except httpx.HTTPError as error:
            logger.error(
                f"[{self.source_id}] Failed to fetch listings index from {index_url}: {error}"
            )
            raise ListingsFetchException(f"Failed to fetch {index_url}: {error}") from error

        logger.info(
            f"[{self.source_id}] Fetched listings index in "
            f"{time.time() - started_at:.2f} seconds, parsing JSON payload"
        )
        return response.json()

    def get_listing_id(self, item: dict[str, Any]) -> str:
        return str(item.get("AnnonsId", "unknown"))

    def get_listing_url(self, item: dict[str, Any]) -> str | None:
        if not item.get("AnnonsId"):
            return None
        return f"{BOSTAD_STHLM_BASE_PATH}/bostad/{item.get('AnnonsId')}"

    async def parse_listing(
        self,
        item: dict[str, Any],
        client: httpx.AsyncClient,
    ) -> Listing:
        return await parse_listing_async(item, client, include_html=True)
