import asyncio
from datetime import datetime
from typing import Any, Optional as Opt

import httpx
from pydantic import ValidationError

from app.http.client import create_async_client
from app.models import (
    AllListingsResponse,
    Listing,
    ListingParseError,
    ListingsStreamEvent,
    ListingsSearchOptions,
    ScrapeEventStatus,
    ScrapeProgress,
)
from app.scraping.types import ListingSource, ProgressCallback

MAX_CONCURRENT_DETAIL_FETCHES = 12


async def _emit_progress(
    source: ListingSource,
    progress_callback: Opt[ProgressCallback],
    event: ScrapeEventStatus,
    progress: ScrapeProgress,
    data: Opt[AllListingsResponse] = None,
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
) -> tuple[int, Opt[Listing], Opt[ListingParseError]]:
    listing_id = source.get_listing_id(item)

    try:
        async with semaphore:
            listing = await source.parse_listing(item, client)
        return index, listing, None
    except (ValidationError, Exception) as error:
        return index, None, ListingParseError(id=listing_id, reason=str(error))


async def scrape_source_listings(
    source: ListingSource,
    options: ListingsSearchOptions,
    progress_callback: Opt[ProgressCallback] = None,
) -> AllListingsResponse:
    """Generic orchestration for scraping one source with bounded concurrency."""
    async with create_async_client() as client:
        started_at = datetime.now()
        data = await source.fetch_listing_index(client, options)
        total_index_items = len(data)
        limit = options.max_listings
        if limit is not None:
            data = data[:limit]
        total = len(data)

        await _emit_progress(
            source,
            progress_callback,
            "started",
            ScrapeProgress(status="started", current=0, total=total),
        )

        semaphore = asyncio.Semaphore(MAX_CONCURRENT_DETAIL_FETCHES)
        tasks = [
            asyncio.create_task(
                _parse_listing_task(source, index, item, client, semaphore)
            )
            for index, item in enumerate(data)
        ]

        indexed_listings: list[tuple[int, Listing]] = []
        indexed_errors: list[tuple[int, ListingParseError]] = []
        errors_count = 0
        completed = 0

        for completed_task in asyncio.as_completed(tasks):
            index, listing, error = await completed_task
            completed += 1

            if listing is not None:
                indexed_listings.append((index, listing))
                listing_id = listing.id
            else:
                if error is None:
                    error = ListingParseError(
                        id="unknown", reason="Unknown parsing failure"
                    )
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
                    listing_id=listing_id,
                ),
            )

        listings = [
            listing for _, listing in sorted(indexed_listings, key=lambda item: item[0])
        ]
        errors = [
            error for _, error in sorted(indexed_errors, key=lambda item: item[0])
        ]
        result = AllListingsResponse(listings=listings, errors=errors)

        print(
            f"Parsed {len(listings)} listings with {len(errors)} errors in {(datetime.now() - started_at).total_seconds():.2f} seconds"
            f" (index items available: {total_index_items}, limit: {limit})"
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
            ),
            data=result,
        )
        return result
