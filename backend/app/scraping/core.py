import asyncio
import logging
import time
from typing import Any

import httpx
from pydantic import ValidationError

from app.models import (
    AllListingsResponse,
    Listing,
    ListingParseError,
    ListingsSearchOptions,
    ListingsStreamEvent,
    ScrapeEventStatus,
    ScrapeProgress,
)
from app.scraping.client import create_async_client
from app.scraping.types import ListingSource, ProgressCallback

MAX_CONCURRENT_DETAIL_FETCHES = 12
logger = logging.getLogger(__name__)

logger.setLevel(logging.DEBUG)


# Browser-like defaults used by both index and detail requests.
DEFAULT_BOSTAD_HEADERS = {
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


def _parse_cookie_header(cookie_header: str) -> dict[str, str]:
    """Parse a raw Cookie header string into key/value pairs.

    This allows us to seed httpx's cookie jar so authenticated state survives
    redirects and subsequent detail-page requests.
    """

    cookies: dict[str, str] = {}
    for part in cookie_header.split(";"):
        segment = part.strip()
        if not segment or "=" not in segment:
            continue
        key, value = segment.split("=", 1)
        key = key.strip()
        value = value.strip()
        if key:
            cookies[key] = value
    return cookies


async def _emit_progress(
    source: ListingSource,
    progress_callback: ProgressCallback|None,
    event: ScrapeEventStatus,
    progress: ScrapeProgress,
    data: AllListingsResponse|None = None,
) -> None:
    if progress_callback is None:
        return

    await progress_callback(
        ListingsStreamEvent(
            event=event,
            progress=progress.model_copy(update={"source": source.source_id}),
            data=data,
        )
    )


async def _parse_listing_task(
    source: ListingSource,
    index: int,
    item: dict[str, Any],
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
) -> tuple[int, Listing|None, ListingParseError|None]:
    listing_id = source.get_listing_id(item)

    try:
        async with semaphore:
            listing = await source.parse_listing(item, client)
        return index, listing, None
    except (ValidationError, Exception) as error:  # noqa: BLE001
        logger.warning(
            f"[{source.source_id}] Failed to parse listing {listing_id}: "
            f"{error.__class__.__name__}: {error}"
        )
        return index, None, ListingParseError(id=listing_id, reason=str(error), url=source.get_listing_url(item))


async def scrape_source_listings(
    source: ListingSource,
    options: ListingsSearchOptions,
    progress_callback: ProgressCallback|None = None,
) -> AllListingsResponse:
    """Generic orchestration for scraping one source with bounded concurrency."""
    async with create_async_client() as client:
        client.headers.update(DEFAULT_BOSTAD_HEADERS)

        cookie_preview = f"{options.cookie[:24]}..." if options.cookie else None
        logger.info(
            f"[{source.source_id}] Starting scrape with options: "
            f"max_listings={options.max_listings}, cookie={cookie_preview}[...] (len={len(options.cookie) if options.cookie else 0}), "
        )

        if options.cookie:
            client.headers["Cookie"] = options.cookie

        else:
            logger.info(f"[{source.source_id}] No cookie provided; fetching index anonymously")

        started_at = time.time()
        data = await source.fetch_listing_index(client, options)

        logged_in: bool|None = None
        if data:
            first_index_item = data[0]
            if isinstance(first_index_item, dict):
                raw_logged_in = first_index_item.get("ArInloggad")
                if isinstance(raw_logged_in, bool):
                    logged_in = raw_logged_in
        logger.info(f"[{source.source_id}] User login status inferred as: {logged_in}")

        total_index_items = len(data)
        limit = options.max_listings
        if limit is not None:
            data = data[:limit]
        total = len(data)

        await _emit_progress(
            source,
            progress_callback,
            "started",
            ScrapeProgress(
                status="started",
                current=0,
                total=total,
                logged_in=logged_in,
            ),
        )

        semaphore = asyncio.Semaphore(MAX_CONCURRENT_DETAIL_FETCHES)
        tasks = [
            asyncio.create_task(_parse_listing_task(source, index, item, client, semaphore))
            for index, item in enumerate(data)
        ]

        indexed_listings: list[tuple[int, Listing]] = []
        indexed_errors: list[tuple[int, ListingParseError]] = []
        errors_count = 0
        completed = 0

        for completed_task in asyncio.as_completed(tasks):
            index, listing, error = await completed_task
            completed += 1  # noqa: SIM113

            if listing is not None:
                indexed_listings.append((index, listing))
                listing_id = listing.id
            else:
                if error is None:
                    error = ListingParseError(id="unknown", reason="Unknown parsing failure")
                indexed_errors.append((index, error))
                errors_count += 1
                listing_id = error.id

            await _emit_progress(
                source,
                progress_callback,
                "progress",
                ScrapeProgress(
                    status="progress",
                    current=completed,
                    total=total,
                    errors=errors_count,
                    logged_in=logged_in,
                    listing_id=listing_id,
                ),
            )

        listings = [listing for _, listing in sorted(indexed_listings, key=lambda item: item[0])]
        errors = [error for _, error in sorted(indexed_errors, key=lambda item: item[0])]
        result = AllListingsResponse(
            listings=listings,
            errors=errors,
            logged_in=logged_in,
        )

        logger.info(
            f"[{source.source_id}] Parsed {len(listings)} listings with {len(errors)} errors "
            f"in {time.time() - started_at:.2f} seconds "
            f"(index items available: {total_index_items}, limit: {limit})"
        )
        await _emit_progress(
            source,
            progress_callback,
            "complete",
            ScrapeProgress(
                status="complete",
                current=total,
                total=total,
                errors=len(errors),
                logged_in=logged_in,
            ),
            data=result,
        )
        return result
