import asyncio
import logging
import time
from typing import Any

import httpx

from app.models import (
    AllocationInfo,
    AllocationMethod,
    Coordinates,
    FurnishingLevel,
    LeaseEndDateValue,
    LeaseStartDateValue,
    Listing,
    ListingFeatures,
    ListingSources,
    ListingSourceStats,
    ListingsSearchOptions,
    QasaSearchOptions,
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
)
from app.scraping.types import ListingSource

logger = logging.getLogger(__name__)


QASA_BASE_PATH = "https://qasa.com"
QASA_GLOBAL_URL = f"{QASA_BASE_PATH}/se/en"
QASA_LISTING_URL_TEMPLATE = f"{QASA_BASE_PATH}/se/en/home/{{listing_id}}"
QASA_GRAPHQL_URL = "https://api.qasa.se/graphql"
INDEX_TIMEOUT = httpx.Timeout(30.0, connect=15.0)
DETAIL_TIMEOUT = httpx.Timeout(15.0, connect=10.0)
DEFAULT_PAGE_SIZE = 200
DETAIL_BATCH_MAX_ITEMS = 200
DETAIL_FETCH_CONCURRENCY = DETAIL_BATCH_MAX_ITEMS
DETAIL_BATCH_MAX_ATTEMPTS = 4
DETAIL_BATCH_RETRY_BASE_SECONDS = 5.0

DEFAULT_HEADERS = {
    "accept": "*/*",
    "content-type": "application/json",
    "origin": QASA_BASE_PATH,
    "referer": f"{QASA_BASE_PATH}/",
    "user-agent": "Mozilla/5.0",
}

HOME_SEARCH_QUERY = """
query HomeSearch($order: HomeIndexSearchOrderInput, $offset: Int, $limit: Int, $params: HomeSearchParamsInput) {
  homeIndexSearch(order: $order, params: $params) {
    documents(offset: $offset, limit: $limit) {
      hasNextPage
      totalCount
      nodes {
        id
                description
        firstHand
        furnished
        homeType
        householdSize
        publishedAt
        rent
        roomCount
        shared
        squareMeters
        startDate
        endDate
        studentHome
        seniorHome
        tenantBaseFee
        title
        location {
          locality
          streetNumber
          route
          point {
            lat
            lon
          }
        }
                uploads {
                    order
                    type
                    url
                }
      }
    }
  }
}
""".strip()

DETAIL_QUERY_FIELDS = """
id
floor
location {
    locality
    latitude
    longitude
    route
    streetNumber
}
duration {
    startAsap
    startOptimal
    endUfn
    endOptimal
}
traits {
    type
    detail
}
""".strip()


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


def _trait_lookup(traits: Any) -> dict[str, str | None]:
    if not isinstance(traits, list):
        return {}

    lookup: dict[str, str | None] = {}
    for trait in traits:
        if not isinstance(trait, dict):
            continue
        trait_type = trait.get("type")
        if not isinstance(trait_type, str) or not trait_type:
            continue
        detail = trait.get("detail")
        lookup[trait_type] = detail if isinstance(detail, str) else None
    return lookup


def _build_image_urls(uploads: Any) -> list[str] | None:
    if not isinstance(uploads, list):
        return None

    ordered_items: list[tuple[int, str]] = []
    for upload in uploads:
        if not isinstance(upload, dict):
            continue
        url = upload.get("url")
        if not isinstance(url, str) or not url:
            continue
        metadata = upload.get("metadata")
        order = metadata.get("order") if isinstance(metadata, dict) else upload.get("order")
        normalized_order = int(order) if isinstance(order, int) else 0
        ordered_items.append((normalized_order, url))

    ordered_items.sort(key=lambda item: item[0])
    image_urls = dedupe_keep_order([url for _, url in ordered_items])
    return image_urls or None


def _build_name(item: dict[str, Any], detail: dict[str, Any]) -> str:
    title = item.get("title")
    if isinstance(title, str) and title.strip():
        return title.strip()

    raw_location = detail.get("location")
    location: dict[str, Any] = raw_location if isinstance(raw_location, dict) else {}
    route = location.get("route") if isinstance(location.get("route"), str) else None
    street_number = (
        location.get("streetNumber") if isinstance(location.get("streetNumber"), str) else None
    )
    locality = location.get("locality") if isinstance(location.get("locality"), str) else None
    if route and street_number:
        return f"{route} {street_number}"
    if route and locality:
        return f"{route}, {locality}"
    if route:
        return route
    if locality:
        return locality
    return str(item.get("id", "unknown"))


def _build_furnishing(item: dict[str, Any], detail: dict[str, Any]) -> FurnishingLevel | None:
    traits = _trait_lookup(detail.get("traits"))
    furniture = traits.get("furniture")
    if furniture == "partly_furnished":
        return FurnishingLevel.PARTIAL
    if furniture == "fully_furnished":
        return FurnishingLevel.FULL

    furnished = item.get("furnished")
    if furnished is True:
        return FurnishingLevel.FULL
    if furnished is False:
        return FurnishingLevel.NONE
    return None


def _build_tenure_type(item: dict[str, Any]) -> TenureType | None:
    if item.get("firstHand") is True:
        return TenureType.FIRST_HAND
    if item.get("shared") is True:
        return TenureType.SECOND_HAND_SHARED
    return TenureType.SECOND_HAND_PRIVATE


def _build_requirements(item: dict[str, Any]) -> TenantRequirements | None:
    household_size = _parse_float(item.get("householdSize"))
    is_student = bool(item.get("studentHome"))
    if household_size is None and not is_student:
        return None

    return TenantRequirements(
        student=is_student,
        num_tenants_range=Range(max=household_size) if household_size is not None else None,
    )


def _build_features(detail: dict[str, Any], image_urls: list[str] | None) -> ListingFeatures:
    traits = _trait_lookup(detail.get("traits"))
    kitchen = any(trait in traits for trait in ["kitchenette", "stove", "oven"])
    bathroom = any(trait in traits for trait in ["shower", "toilet", "bathtub"])
    return ListingFeatures(
        balcony=True if "balcony" in traits else None,
        elevator=True if "elevator" in traits else None,
        kitchen=kitchen if kitchen else None,
        bathroom=bathroom if bathroom else None,
        dishwasher="dish_washer" in traits,
        washing_machine="washing_machine" in traits,
        dryer="dryer" in traits or "drier" in traits,
        has_viewing=True,
        has_pictures=bool(image_urls),
        num_pictures=len(image_urls or []),
    )


def _build_detail_batch_query(batch_ids: list[str]) -> tuple[str, dict[str, str]]:
    variables = {f"id{index}": listing_id for index, listing_id in enumerate(batch_ids)}
    variable_declarations = ", ".join(f"$id{index}: ID!" for index in range(len(batch_ids)))
    aliases = "\n".join(
        f"  h{index}: home(id: $id{index}) {{\n    {DETAIL_QUERY_FIELDS.replace(chr(10), chr(10) + '    ')}\n  }}"
        for index in range(len(batch_ids))
    )
    return (
        f"query QasaHomeDetails({variable_declarations}) {{\n{aliases}\n}}",
        variables,
    )


def _parse_lease_start(item: dict[str, Any], detail: dict[str, Any]) -> LeaseStartDateValue | None:
    raw_duration = detail.get("duration")
    duration: dict[str, Any] = raw_duration if isinstance(raw_duration, dict) else {}
    if duration.get("startAsap") is True:
        return "asap"

    start_value = duration.get("startOptimal") or item.get("startDate")
    if not isinstance(start_value, str):
        return None

    parsed = parse_iso_datetime(start_value)
    return parsed.date().isoformat() if parsed is not None else None


def _parse_lease_end(item: dict[str, Any], detail: dict[str, Any]) -> LeaseEndDateValue | None:
    raw_duration = detail.get("duration")
    duration: dict[str, Any] = raw_duration if isinstance(raw_duration, dict) else {}
    if duration.get("endUfn") is True:
        return "indefinite"

    end_value = duration.get("endOptimal") or item.get("endDate")
    if not isinstance(end_value, str):
        return None

    parsed = parse_iso_datetime(end_value)
    return parsed.date().isoformat() if parsed is not None else None


def _build_coords(item: dict[str, Any], detail: dict[str, Any]) -> Coordinates | None:
    raw_location = detail.get("location")
    location: dict[str, Any] = raw_location if isinstance(raw_location, dict) else {}
    lat = _parse_float(location.get("latitude"))
    lon = _parse_float(location.get("longitude"))
    if lat is not None and lon is not None:
        return Coordinates(lat=lat, long=lon)

    raw_item_location = item.get("location")
    item_location: dict[str, Any] = raw_item_location if isinstance(raw_item_location, dict) else {}
    raw_point = item_location.get("point")
    point: dict[str, Any] = raw_point if isinstance(raw_point, dict) else {}
    lat = _parse_float(point.get("lat"))
    lon = _parse_float(point.get("lon"))
    if lat is not None and lon is not None:
        return Coordinates(lat=lat, long=lon)
    return None


class QasaSource(ListingSource):
    source_id: ListingSources = ListingSources.QASA
    name = "Qasa"
    global_url = QASA_GLOBAL_URL
    detail_fetch_concurrency = DETAIL_FETCH_CONCURRENCY

    def __init__(self) -> None:
        self._detail_batch_lock = asyncio.Lock()
        self._detail_batch_waiters: dict[str, asyncio.Future[dict[str, Any]]] = {}
        self._detail_batch_task: asyncio.Task[None] | None = None

    def _get_options(self, options: ListingsSearchOptions) -> QasaSearchOptions:
        return options.qasa or QasaSearchOptions()

    def configure_client(
        self,
        client: httpx.AsyncClient,
        options: ListingsSearchOptions,
    ) -> None:
        source_options = self._get_options(options)
        client.headers.update(DEFAULT_HEADERS)
        logger.info(
            "[%s] Starting scrape with options: max_listings=%s, page_size=%s, detail_fetch_concurrency=%s",
            self.source_id,
            source_options.max_listings,
            DEFAULT_PAGE_SIZE,
            self.detail_fetch_concurrency,
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

    async def _post_graphql(
        self,
        client: httpx.AsyncClient,
        *,
        operation_name: str,
        query: str,
        variables: dict[str, Any],
        timeout: httpx.Timeout,
        exception_type: type[Exception],
    ) -> dict[str, Any]:
        try:
            response = await client.post(
                QASA_GRAPHQL_URL,
                json={
                    "operationName": operation_name,
                    "query": query,
                    "variables": variables,
                },
                timeout=timeout,
            )
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise exception_type(f"Failed to fetch {QASA_GRAPHQL_URL}: {error}") from error

        payload = response.json()
        if not isinstance(payload, dict):
            raise exception_type(f"Unexpected payload from {QASA_GRAPHQL_URL}")

        errors = payload.get("errors")
        if isinstance(errors, list) and errors:
            messages: list[str] = []
            for error in errors:
                if not isinstance(error, dict):
                    continue
                message = error.get("message")
                if isinstance(message, str):
                    messages.append(message)
            joined = "; ".join(messages) if messages else "Unknown GraphQL error"
            raise exception_type(f"Failed to fetch {QASA_GRAPHQL_URL}: {joined}")

        data = payload.get("data")
        if not isinstance(data, dict):
            raise exception_type(f"Unexpected GraphQL data from {QASA_GRAPHQL_URL}")
        return data

    async def _fetch_detail_batch(
        self,
        client: httpx.AsyncClient,
        batch_ids: list[str],
    ) -> dict[str, Any]:
        query, variables = _build_detail_batch_query(batch_ids)
        response: httpx.Response | None = None

        for attempt in range(1, DETAIL_BATCH_MAX_ATTEMPTS + 1):
            try:
                response = await client.post(
                    QASA_GRAPHQL_URL,
                    json={
                        "operationName": "QasaHomeDetails",
                        "query": query,
                        "variables": variables,
                    },
                    timeout=DETAIL_TIMEOUT,
                )
            except httpx.HTTPError as error:
                raise ListingParseException(
                    f"Failed to fetch {QASA_GRAPHQL_URL}: {error}"
                ) from error

            if response.status_code != 429:
                break

            if attempt >= DETAIL_BATCH_MAX_ATTEMPTS:
                detail = response.text.strip() or "Retry later"
                raise ListingParseException(f"Failed to fetch {QASA_GRAPHQL_URL}: {detail}")

            wait_seconds = DETAIL_BATCH_RETRY_BASE_SECONDS * (2 ** (attempt - 1))
            logger.warning(
                "[%s] Qasa detail batch rate limited for %s listings on attempt %s/%s, retrying in %.1fs",
                self.source_id,
                len(batch_ids),
                attempt,
                DETAIL_BATCH_MAX_ATTEMPTS,
                wait_seconds,
            )
            await asyncio.sleep(wait_seconds)

        if response is None:
            raise ListingParseException(f"Failed to fetch {QASA_GRAPHQL_URL}: no response")

        try:
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise ListingParseException(f"Failed to fetch {QASA_GRAPHQL_URL}: {error}") from error

        payload = response.json()
        if not isinstance(payload, dict):
            raise ListingParseException(f"Unexpected payload from {QASA_GRAPHQL_URL}")

        errors = payload.get("errors")
        if isinstance(errors, list) and errors:
            messages: list[str] = []
            for error in errors:
                if not isinstance(error, dict):
                    continue
                message = error.get("message")
                if isinstance(message, str):
                    messages.append(message)
            joined = "; ".join(messages) if messages else "Unknown GraphQL error"
            raise ListingParseException(f"Failed to fetch {QASA_GRAPHQL_URL}: {joined}")

        data = payload.get("data")
        if not isinstance(data, dict):
            raise ListingParseException(f"Unexpected GraphQL data from {QASA_GRAPHQL_URL}")
        return data

    async def _run_detail_batch_loop(self, client: httpx.AsyncClient) -> None:
        await asyncio.sleep(0)

        while True:
            async with self._detail_batch_lock:
                if not self._detail_batch_waiters:
                    self._detail_batch_task = None
                    return

                batch_ids = list(self._detail_batch_waiters.keys())[:DETAIL_BATCH_MAX_ITEMS]
                batch_waiters = {
                    listing_id: self._detail_batch_waiters.pop(listing_id)
                    for listing_id in batch_ids
                }

            try:
                batch_data = await self._fetch_detail_batch(client, batch_ids)
            except Exception as error:  # noqa: BLE001
                for future in batch_waiters.values():
                    if not future.done():
                        future.set_exception(error)
                continue

            for index, listing_id in enumerate(batch_ids):
                future = batch_waiters[listing_id]
                if future.done():
                    continue
                detail = batch_data.get(f"h{index}")
                if not isinstance(detail, dict):
                    future.set_exception(
                        ListingParseException(
                            f"Invalid Qasa detail payload for listing {listing_id}"
                        )
                    )
                    continue
                future.set_result(detail)

    async def _get_detail_for_listing(
        self,
        item: dict[str, Any],
        client: httpx.AsyncClient,
    ) -> dict[str, Any]:
        listing_id = self.get_listing_id(item)
        async with self._detail_batch_lock:
            future = self._detail_batch_waiters.get(listing_id)
            if future is None:
                future = asyncio.get_running_loop().create_future()
                self._detail_batch_waiters[listing_id] = future
            if self._detail_batch_task is None:
                self._detail_batch_task = asyncio.create_task(self._run_detail_batch_loop(client))

        return await future

    async def fetch_listing_index(
        self,
        client: httpx.AsyncClient,
        options: ListingsSearchOptions,
    ) -> list[dict[str, Any]]:
        if self.source_id not in options.sources:
            raise ValueError(f"Unsupported source selection for {self.source_id}")

        configured_limit = self._get_options(options).max_listings
        offset = 0
        results: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        total_count: int | None = None
        started_at = time.time()

        while True:
            remaining = (
                None if configured_limit is None else max(configured_limit - len(results), 0)
            )
            if remaining == 0:
                break

            page_limit = (
                min(DEFAULT_PAGE_SIZE, remaining) if remaining is not None else DEFAULT_PAGE_SIZE
            )
            data = await self._post_graphql(
                client,
                operation_name="HomeSearch",
                query=HOME_SEARCH_QUERY,
                variables={
                    "offset": offset,
                    "limit": page_limit,
                    "order": {"direction": "descending", "orderBy": "published_or_bumped_at"},
                    "params": {
                        "currency": "SEK",
                        "areaIdentifier": ["se/stockholm_county"],
                        "markets": ["sweden"],
                    },
                },
                timeout=INDEX_TIMEOUT,
                exception_type=ListingsFetchException,
            )

            search_result = data.get("homeIndexSearch")
            documents = search_result.get("documents") if isinstance(search_result, dict) else None
            if not isinstance(documents, dict):
                raise ListingsFetchException("Invalid Qasa index payload")

            nodes = documents.get("nodes")
            if not isinstance(nodes, list) or not nodes:
                break

            total_count = (
                documents.get("totalCount")
                if isinstance(documents.get("totalCount"), int)
                else total_count
            )
            for node in nodes:
                if not isinstance(node, dict):
                    continue
                node_id = node.get("id")
                if not isinstance(node_id, str):
                    continue
                if node_id in seen_ids:
                    continue
                seen_ids.add(node_id)
                results.append(node)
                if configured_limit is not None and len(results) >= configured_limit:
                    break

            if configured_limit is not None and len(results) >= configured_limit:
                break

            if documents.get("hasNextPage") is not True:
                break
            offset += page_limit

        logger.info(
            "[%s] Fetched %s/%s Qasa listings in %.2f seconds",
            self.source_id,
            len(results),
            total_count if total_count is not None else "?",
            time.time() - started_at,
        )
        return results

    def get_listing_id(self, item: dict[str, Any]) -> str:
        return str(item.get("id", "unknown"))

    def get_listing_url(self, item: dict[str, Any]) -> str | None:
        source_local_id = self.get_listing_id(item)
        return QASA_LISTING_URL_TEMPLATE.format(listing_id=source_local_id)

    async def parse_listing(
        self,
        item: dict[str, Any],
        client: httpx.AsyncClient,
    ) -> Listing:
        source_local_id = self.get_listing_id(item)
        detail = await self._get_detail_for_listing(item, client)

        rent = _parse_float(item.get("rent"))
        tenant_base_fee = _parse_float(item.get("tenantBaseFee"))
        area_sqm = _parse_float(item.get("squareMeters"))
        num_rooms = _parse_float(item.get("roomCount"))
        if rent is None or area_sqm is None or num_rooms is None:
            raise ListingParseException(
                f"Missing required Qasa fields for listing {source_local_id}"
            )
        if tenant_base_fee is not None:
            rent += tenant_base_fee

        image_urls = _build_image_urls(item.get("uploads"))
        lease_start_date = _parse_lease_start(item, detail)
        lease_end_date = _parse_lease_end(item, detail)
        coords = _build_coords(item, detail)
        locality = None
        raw_detail_location = detail.get("location")
        detail_location: dict[str, Any] = (
            raw_detail_location if isinstance(raw_detail_location, dict) else {}
        )
        if isinstance(detail_location.get("locality"), str):
            locality = detail_location.get("locality")
        elif isinstance(item.get("location"), dict) and isinstance(
            item["location"].get("locality"), str
        ):
            locality = item["location"].get("locality")
        if locality is None:
            raise ListingParseException(f"Missing location for Qasa listing {source_local_id}")

        raw_description = item.get("description")
        if not isinstance(raw_description, str):
            raw_description = detail.get("description")
        description = raw_description.strip() if isinstance(raw_description, str) else None

        return Listing(
            id=build_source_scoped_id(self.source_id, source_local_id),
            source=self.source_id,
            source_local_id=source_local_id,
            url=self.get_listing_url(item) or self.global_url,
            name=_build_name(item, detail),
            loc_municipality=locality,
            loc_district=locality,
            rent=rent,
            area_sqm=area_sqm,
            num_rooms=num_rooms,
            apartment_type=(
                "student"
                if item.get("studentHome")
                else "senior"
                if item.get("seniorHome")
                else "regular"
            ),
            furnishing=_build_furnishing(item, detail),
            tenure_type=_build_tenure_type(item),
            features=_build_features(
                detail | ({"description": description} if description is not None else {}),
                image_urls,
            ),
            floor=_parse_float(detail.get("floor")),
            lease_start_date=lease_start_date,
            lease_end_date=lease_end_date,
            coords=coords,
            application_deadline_date=None,
            allocation_info=AllocationInfo(
                allocation_method=AllocationMethod.MANUAL_REQUEST  # listings are posted by individuals
            ),
            requirements=_build_requirements(item),
            date_posted=(
                parse_iso_datetime(item["publishedAt"])
                if isinstance(item.get("publishedAt"), str)
                else None
            ),
            image_urls=image_urls,
            floorplan_url=None,
            free_text=description if description else None,
        )
