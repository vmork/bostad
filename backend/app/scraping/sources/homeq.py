import asyncio
import logging
import time
from typing import Any
from urllib.parse import urljoin

import httpx

from app.models import (
    Coordinates,
    DateRange,
    HomeQSearchOptions,
    Listing,
    ListingFeatures,
    ListingSourceStats,
    ListingSources,
    ListingsSearchOptions,
    Range,
    TenantRequirements,
)
from app.scraping.scrape_utils import (
    ListingParseException,
    ListingsFetchException,
    build_source_scoped_id,
    dedupe_keep_order,
    parse_iso_datetime,
)
from app.scraping.types import ListingSource

logger = logging.getLogger(__name__)


HOMEQ_BASE_PATH = "https://www.homeq.se"
HOMEQ_SEARCH_URL = "https://api.homeq.se/api/v3/search"
HOMEQ_OBJECT_URL = "https://api.homeq.se/api/v1/object/{object_id}"
HOMEQ_PROJECT_URL = "https://api.homeq.se/api/v1/projects/{project_id}"
HOMEQ_PROJECT_MEDIA_URL = "https://api.homeq.se/api/v1/projects/{project_id}/media"

STOCKHOLM_COUNTY = "stockholms län"
SEARCH_PAGE_SIZE = 1000
LISTINGS_TIMEOUT = httpx.Timeout(30.0, connect=15.0)
DETAIL_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
DETAIL_REQUESTS_PER_MINUTE = 100
DETAIL_REQUEST_INTERVAL_SECONDS = 60.0 / DETAIL_REQUESTS_PER_MINUTE
DETAIL_RATE_LIMIT_COOLDOWN_SECONDS = 65.0
DETAIL_MAX_FETCH_ATTEMPTS = 3

DEFAULT_HEADERS = {
    "accept": "*/*",
    "accept-language": "sv-SE,sv;q=0.9,en-SE;q=0.8,en;q=0.7,en-US;q=0.6",
    "content-type": "application/json",
    "priority": "u=1, i",
    "sec-ch-ua": '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent": "Mozilla/5.0",
}


def _parse_float(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        normalized = value.strip().replace(",", ".")
        if not normalized:
            return None
        try:
            return float(normalized)
        except ValueError:
            return None
    return None


def _parse_range(value: Any) -> Range | None:
    if not isinstance(value, list) or len(value) != 2:
        return None

    minimum = _parse_float(value[0])
    maximum = _parse_float(value[1])
    if minimum is None and maximum is None:
        return None
    return Range(min=minimum, max=maximum)


def _build_url(uri: str | None) -> str | None:
    if not uri:
        return None
    return urljoin(HOMEQ_BASE_PATH, uri)


def _normalize_county(value: Any) -> str:
    return value.strip().lower() if isinstance(value, str) else ""


def _is_stockholm_listing(item: dict[str, Any]) -> bool:
    return _normalize_county(item.get("county")) == STOCKHOLM_COUNTY


def _has_project_ranges(item: dict[str, Any]) -> bool:
    if item.get("type") != "project":
        return True

    rent_range = _parse_range(item.get("rent_range"))
    return rent_range is not None and rent_range.min is not None


def _infer_apartment_type(detail: dict[str, Any]) -> str:
    if detail.get("is_student"):
        return "student"
    if detail.get("is_youth"):
        return "youth"
    if detail.get("is_senior"):
        return "senior"
    return "regular"


def _build_requirements(detail: dict[str, Any]) -> TenantRequirements | None:
    student = bool(detail.get("is_student"))
    age_min: float | None = None
    age_max: float | None = None
    if detail.get("is_senior"):
        age_min = _parse_float(detail.get("senior_age"))
    if detail.get("is_youth"):
        age_max = _parse_float(detail.get("youth_age"))

    num_tenants_max = _parse_float(detail.get("capacity"))
    if not student and age_min is None and age_max is None and num_tenants_max is None:
        return None

    return TenantRequirements(
        student=student,
        age_range=(
            Range(min=age_min, max=age_max) if age_min is not None or age_max is not None else None
        ),
        num_tenants_range=Range(max=num_tenants_max) if num_tenants_max is not None else None,
    )


def _merge_text_parts(parts: list[str | None]) -> str | None:
    merged = [part.strip() for part in parts if isinstance(part, str) and part.strip()]
    if not merged:
        return None
    return "\n\n".join(dedupe_keep_order(merged))


def _image_urls_from_media(items: Any) -> list[str] | None:
    if not isinstance(items, list):
        return None

    urls = [
        image_url
        for item in items
        if isinstance(item, dict)
        and isinstance((image_url := item.get("image") or item.get("url")), str)
        and image_url
    ]
    urls = dedupe_keep_order(urls)
    return urls or None


class HomeQSource(ListingSource):
    source_id: ListingSources = ListingSources.HOMEQ
    name = "HomeQ"
    global_url = HOMEQ_BASE_PATH
    # Keep a low worker count and a paced request cadence. HomeQ starts
    # returning 429s well before large fetches finish if detail requests are
    # allowed to burst.
    detail_fetch_concurrency = 4

    def __init__(self) -> None:
        self._detail_request_lock = asyncio.Lock()
        self._next_detail_request_at = 0.0
        self._detail_rate_limited_until = 0.0

    def _monotonic(self) -> float:
        return time.monotonic()

    async def _sleep(self, seconds: float) -> None:
        await asyncio.sleep(seconds)

    async def _wait_for_detail_slot(self) -> None:
        async with self._detail_request_lock:
            now = self._monotonic()
            earliest_allowed_at = max(
                self._next_detail_request_at,
                self._detail_rate_limited_until,
            )
            wait_seconds = earliest_allowed_at - now
            if wait_seconds > 0:
                await self._sleep(wait_seconds)
                now = self._monotonic()
                earliest_allowed_at = max(
                    self._next_detail_request_at,
                    self._detail_rate_limited_until,
                )

            self._next_detail_request_at = (
                max(now, earliest_allowed_at) + DETAIL_REQUEST_INTERVAL_SECONDS
            )

    def _parse_retry_after_seconds(self, retry_after: str | None) -> float | None:
        if retry_after is None:
            return None

        try:
            parsed = float(retry_after)
        except ValueError:
            return None
        return parsed if parsed > 0 else None

    def _describe_rate_limit(self, response: httpx.Response) -> str | None:
        try:
            payload = response.json()
        except ValueError:
            payload = None

        if isinstance(payload, dict):
            error = payload.get("error")
            description = payload.get("description")
            if isinstance(error, str) and isinstance(description, str):
                return f"{error}: {description}"
            if isinstance(description, str):
                return description
            if isinstance(error, str):
                return error

        text = response.text.strip()
        return text or None

    async def _mark_rate_limited(
        self,
        response: httpx.Response,
        url: str,
        attempt: int,
    ) -> None:
        description = self._describe_rate_limit(response) or "Too many requests"
        retry_after = self._parse_retry_after_seconds(response.headers.get("retry-after"))
        cooldown_seconds = max(retry_after or 0.0, DETAIL_RATE_LIMIT_COOLDOWN_SECONDS)

        async with self._detail_request_lock:
            limited_until = self._monotonic() + cooldown_seconds
            self._detail_rate_limited_until = max(
                self._detail_rate_limited_until,
                limited_until,
            )
            self._next_detail_request_at = max(
                self._next_detail_request_at,
                self._detail_rate_limited_until,
            )

        logger.warning(
            "[%s] HomeQ rate limited detail fetch for %s on attempt %s/%s, backing off for %.1f seconds: %s",
            self.source_id,
            url,
            attempt,
            DETAIL_MAX_FETCH_ATTEMPTS,
            cooldown_seconds,
            description,
        )

    def _get_options(self, options: ListingsSearchOptions) -> HomeQSearchOptions:
        return options.homeq or HomeQSearchOptions()

    def configure_client(
        self,
        client: httpx.AsyncClient,
        options: ListingsSearchOptions,
    ) -> None:
        source_options = self._get_options(options)
        client.headers.update(DEFAULT_HEADERS)
        logger.info(
            "[%s] Starting scrape with options: max_listings=%s, county=%s, detail_rate=%s/min",
            self.source_id,
            source_options.max_listings,
            STOCKHOLM_COUNTY,
            DETAIL_REQUESTS_PER_MINUTE,
        )

    def infer_logged_in(self, items: list[dict[str, Any]]) -> bool | None:
        return False

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
            raise ValueError(f"Unsupported source selection for {self.source_id}")

        limit = self._get_options(options).max_listings
        page = 1
        results: list[dict[str, Any]] = []
        seen_ids: set[tuple[Any, Any]] = set()
        started_at = time.time()

        while True:
            payload = {
                "sorting": "rent.asc",
                "page": page,
                "amount": SEARCH_PAGE_SIZE,
            }
            try:
                response = await client.post(
                    HOMEQ_SEARCH_URL, json=payload, timeout=LISTINGS_TIMEOUT
                )
                response.raise_for_status()
            except httpx.HTTPError as error:
                raise ListingsFetchException(
                    f"Failed to fetch {HOMEQ_SEARCH_URL}: {error}"
                ) from error

            page_items = response.json().get("results", [])
            if not page_items:
                break

            for item in page_items:
                if not isinstance(item, dict):
                    continue
                if not _is_stockholm_listing(item):
                    continue
                if not _has_project_ranges(item):
                    continue

                key = (item.get("type"), item.get("id"))
                if key in seen_ids:
                    continue
                seen_ids.add(key)
                results.append(item)

                if limit is not None and len(results) >= limit:
                    logger.info(
                        "[%s] Fetched %s Stockholm listings in %.2f seconds",
                        self.source_id,
                        len(results),
                        time.time() - started_at,
                    )
                    return results

            page += 1

        logger.info(
            "[%s] Fetched %s Stockholm listings in %.2f seconds",
            self.source_id,
            len(results),
            time.time() - started_at,
        )
        return results

    def get_listing_id(self, item: dict[str, Any]) -> str:
        return str(item.get("id", "unknown"))

    def get_listing_url(self, item: dict[str, Any]) -> str | None:
        uri = item.get("uri")
        return _build_url(uri if isinstance(uri, str) else None)

    async def _fetch_json(self, client: httpx.AsyncClient, url: str) -> dict[str, Any]:
        for attempt in range(1, DETAIL_MAX_FETCH_ATTEMPTS + 1):
            await self._wait_for_detail_slot()

            try:
                response = await client.get(url, timeout=DETAIL_TIMEOUT)
            except httpx.HTTPError as error:
                raise ListingParseException(f"Failed to fetch {url}: {error}") from error

            if response.status_code == 429:
                if attempt >= DETAIL_MAX_FETCH_ATTEMPTS:
                    detail = self._describe_rate_limit(response) or "Too many requests"
                    raise ListingParseException(f"Failed to fetch {url}: {detail}")

                await self._mark_rate_limited(response, url, attempt)
                continue

            try:
                response.raise_for_status()
            except httpx.HTTPError as error:
                raise ListingParseException(f"Failed to fetch {url}: {error}") from error

            payload = response.json()
            if not isinstance(payload, dict):
                raise ListingParseException(f"Unexpected payload from {url}")
            return payload

        raise ListingParseException(f"Failed to fetch {url}: exhausted retries")

    def _parse_individual_listing(
        self,
        item: dict[str, Any],
        detail: dict[str, Any],
    ) -> Listing:
        source_local_id = self.get_listing_id(item)
        municipality = detail.get("municipality") or item.get("municipality") or item.get("city")
        district = detail.get("city") or item.get("city") or municipality
        area_sqm = _parse_float(detail.get("area"))
        num_rooms = _parse_float(detail.get("rooms"))
        rent = _parse_float(detail.get("rent"))
        if (
            municipality is None
            or district is None
            or area_sqm is None
            or num_rooms is None
            or rent is None
        ):
            raise ListingParseException(
                f"Missing required HomeQ fields for listing {source_local_id}"
            )

        lat = _parse_float(detail.get("latitude"))
        lon = _parse_float(detail.get("longitude"))
        coords = (
            Coordinates(lat=lat, long=lon)
            if lat is not None and lon is not None
            else (
                Coordinates(lat=float(item["location"]["lat"]), long=float(item["location"]["lon"]))
                if isinstance(item.get("location"), dict)
                and item["location"].get("lat") is not None
                and item["location"].get("lon") is not None
                else None
            )
        )

        image_urls = _image_urls_from_media(detail.get("images"))
        floorplan_url = (
            detail.get("plan_image") if isinstance(detail.get("plan_image"), str) else None
        )
        rental_period = None
        short_min = (
            parse_iso_datetime(detail.get("short_lease_min_date", ""))
            if detail.get("short_lease_min_date")
            else None
        )
        short_max = (
            parse_iso_datetime(detail.get("short_lease_max_date", ""))
            if detail.get("short_lease_max_date")
            else None
        )
        if short_min is not None or short_max is not None:
            rental_period = DateRange(min=short_min, max=short_max)

        return Listing(
            id=build_source_scoped_id(self.source_id, source_local_id),
            source=self.source_id,
            source_local_id=source_local_id,
            url=self.get_listing_url(item) or self.global_url,
            name=(
                detail.get("street")
                and detail.get("street_number")
                and f"{detail['street']} {detail['street_number']}"
            )
            or str(item.get("title") or source_local_id),
            loc_municipality=str(municipality),
            loc_district=str(district),
            rent=rent,
            area_sqm=area_sqm,
            num_rooms=num_rooms,
            apartment_type=_infer_apartment_type(detail),
            features=ListingFeatures(
                balcony=bool(detail.get("has_balcony")),
                elevator=bool(detail.get("has_elevator")),
                new_production=bool(detail.get("new_production")),
                dishwasher=bool(detail.get("has_dishwasher")),
                washing_machine=bool(detail.get("has_washing_machine")),
                dryer=bool(detail.get("has_drier")),
                has_pictures=image_urls is not None and len(image_urls) > 0,
                has_floorplan=floorplan_url is not None,
            ),
            floor=_parse_float(detail.get("floor")),
            rental_period=rental_period,
            coords=coords,
            requirements=_build_requirements(detail),
            date_posted=parse_iso_datetime(str(detail.get("date_publish")))
            if detail.get("date_publish")
            else None,
            image_urls=image_urls,
            floorplan_url=floorplan_url,
            free_text=_merge_text_parts([
                detail.get("description"),
                detail.get("area_description"),
            ]),
        )

    def _parse_project_listing(
        self,
        item: dict[str, Any],
        detail: dict[str, Any],
        media: dict[str, Any],
    ) -> Listing:
        source_local_id = self.get_listing_id(item)
        range_information = (
            detail.get("range_information")
            if isinstance(detail.get("range_information"), dict)
            else {}
        )
        rent_range = _parse_range(range_information.get("rent"))
        area_range = _parse_range(range_information.get("area"))
        rooms_range = _parse_range(range_information.get("rooms"))
        floor_range = _parse_range(range_information.get("floor"))
        if (
            rent_range is None
            or rent_range.min is None
            or area_range is None
            or area_range.min is None
            or rooms_range is None
            or rooms_range.min is None
        ):
            raise ListingParseException(
                f"Missing required HomeQ project ranges for {source_local_id}"
            )

        location = (
            detail.get("project_location")
            if isinstance(detail.get("project_location"), dict)
            else {}
        )
        lat = _parse_float(location.get("latitude"))
        lon = _parse_float(location.get("longitude"))
        coords = (
            Coordinates(lat=lat, long=lon)
            if lat is not None and lon is not None
            else (
                Coordinates(lat=float(item["location"]["lat"]), long=float(item["location"]["lon"]))
                if isinstance(item.get("location"), dict)
                and item["location"].get("lat") is not None
                and item["location"].get("lon") is not None
                else None
            )
        )

        image_urls = _image_urls_from_media(media.get("project_images"))
        freetext_entries = (
            detail.get("freetext_entries")
            if isinstance(detail.get("freetext_entries"), list)
            else []
        )
        freetext_parts = [detail.get("info_header"), detail.get("info_description")]
        freetext_parts.extend(
            f"{entry.get('title')}\n{entry.get('description')}"
            for entry in freetext_entries
            if isinstance(entry, dict)
        )
        municipality = item.get("municipality") or item.get("city") or location.get("city")
        district = item.get("city") or municipality
        if municipality is None or district is None:
            raise ListingParseException(
                f"Missing required HomeQ project location for {source_local_id}"
            )

        return Listing(
            id=build_source_scoped_id(self.source_id, source_local_id),
            source=self.source_id,
            source_local_id=source_local_id,
            url=self.get_listing_url(item) or self.global_url,
            name=str(detail.get("name") or item.get("title") or source_local_id).strip(),
            loc_municipality=str(municipality),
            loc_district=str(district),
            rent=rent_range.min,
            area_sqm=area_range.min,
            num_rooms=rooms_range.min,
            apartment_type="regular",
            features=ListingFeatures(
                new_production=True,
                has_pictures=image_urls is not None and len(image_urls) > 0,
                has_floorplan=False,
            ),
            floor=floor_range.max if floor_range is not None else None,
            coords=coords,
            date_posted=parse_iso_datetime(str(detail.get("publish_date")))
            if detail.get("publish_date")
            else None,
            image_urls=image_urls,
            free_text=_merge_text_parts(freetext_parts),
            num_apartments=int(item.get("active_ads"))
            if isinstance(item.get("active_ads"), int)
            else None,
            rent_range=rent_range,
            area_sqm_range=area_range,
            floor_range=floor_range,
        )

    async def parse_listing(
        self,
        item: dict[str, Any],
        client: httpx.AsyncClient,
    ) -> Listing:
        listing_type = item.get("type")
        if listing_type == "individual":
            references = item.get("references") if isinstance(item.get("references"), dict) else {}
            object_id = references.get("object_ad")
            if object_id is None:
                raise ListingParseException(
                    f"Missing object_ad for HomeQ listing {self.get_listing_id(item)}"
                )
            detail_payload = await self._fetch_json(
                client, HOMEQ_OBJECT_URL.format(object_id=object_id)
            )
            detail = detail_payload.get("object_ad")
            if not isinstance(detail, dict):
                raise ListingParseException(
                    f"Invalid object payload for HomeQ listing {self.get_listing_id(item)}"
                )
            return self._parse_individual_listing(item, detail)

        if listing_type == "project":
            references = item.get("references") if isinstance(item.get("references"), dict) else {}
            project_id = references.get("project") or item.get("id")
            if project_id is None:
                raise ListingParseException(
                    f"Missing project id for HomeQ listing {self.get_listing_id(item)}"
                )
            detail = await self._fetch_json(client, HOMEQ_PROJECT_URL.format(project_id=project_id))
            media = await self._fetch_json(
                client, HOMEQ_PROJECT_MEDIA_URL.format(project_id=project_id)
            )
            return self._parse_project_listing(item, detail, media)

        raise ListingParseException(f"Unsupported HomeQ listing type {listing_type!r}")
