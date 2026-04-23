import asyncio
import logging
import time
from typing import Any

import httpx
from pydantic import ValidationError

from app.geo import lookup_district
from app.models import (
    AllListingsResponse,
    Listing,
    ListingParseError,
    ListingSourceStats,
    ListingsSearchOptions,
    ListingsStreamEvent,
    ScrapeEventStatus,
    ScrapeProgress,
)
from app.scraping.client import create_async_client
from app.scraping.types import ListingSource, ProgressCallback

logger = logging.getLogger(__name__)

logger.setLevel(logging.DEBUG)


def _merge_source_stats(stats: list[ListingSourceStats]) -> list[ListingSourceStats]:
    """Preserve source order while replacing older stats with newer snapshots."""

    stats_by_source = {stat.source: stat for stat in stats}
    return list(stats_by_source.values())


def _merge_responses(responses: list[AllListingsResponse]) -> AllListingsResponse:
    listings = [listing for response in responses for listing in response.listings]
    errors = [error for response in responses for error in response.errors]
    source_stats = _merge_source_stats([
        stat for response in responses for stat in response.source_stats
    ])
    return AllListingsResponse(
        listings=listings,
        errors=errors,
        source_stats=source_stats,
    )


async def _emit_progress(
    source: ListingSource,
    progress_callback: ProgressCallback | None,
    event: ScrapeEventStatus,
    progress: ScrapeProgress,
    data: AllListingsResponse | None = None,
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
) -> tuple[int, Listing | None, ListingParseError | None]:

    try:
        async with semaphore:
            listing = await source.parse_listing(item, client)
        # Assign district via point-in-polygon lookup
        if listing.coords is not None:
            listing.district_id = lookup_district(listing.coords.lat, listing.coords.long)
        return index, listing, None
    except (ValidationError, Exception) as error:  # noqa: BLE001
        source_local_id = source.get_listing_id(item)
        logger.warning(
            f"[{source.source_id}] Failed to parse listing {source_local_id}: "
            f"{error.__class__.__name__}: {error}"
        )
        return (
            index,
            None,
            ListingParseError(
                id=f"{source.source_id}:{source_local_id}",
                source=source.source_id,
                source_local_id=source_local_id,
                reason=str(error),
                url=source.get_listing_url(item),
            ),
        )


async def scrape_source_listings(
    source: ListingSource,
    options: ListingsSearchOptions,
    progress_callback: ProgressCallback | None = None,
) -> AllListingsResponse:
    """Generic orchestration for scraping one source with bounded concurrency."""
    async with create_async_client() as client:
        source.configure_client(client, options)

        started_at = time.time()
        data = await source.fetch_listing_index(client, options)

        logged_in = source.infer_logged_in(data)
        logger.info(f"[{source.source_id}] User login status inferred as: {logged_in}")

        total_index_items = len(data)
        data = source.limit_index_items(data, options)
        total = len(data)
        source_stats = [
            source.build_source_stats(logged_in=logged_in, num_listings=0, num_errors=0)
        ]

        await _emit_progress(
            source,
            progress_callback,
            "started",
            ScrapeProgress(
                status="started",
                current=0,
                total=total,
                source_stats=source_stats,
            ),
        )

        semaphore = asyncio.Semaphore(source.detail_fetch_concurrency)
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
                    error = ListingParseError(
                        id=f"{source.source_id}:unknown",
                        source=source.source_id,
                        source_local_id="unknown",
                        reason="Unknown parsing failure",
                    )
                indexed_errors.append((index, error))
                errors_count += 1
                listing_id = error.id

            source_stats = [
                source.build_source_stats(
                    logged_in=logged_in,
                    num_listings=len(indexed_listings),
                    num_errors=errors_count,
                )
            ]

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
                    source_stats=source_stats,
                ),
            )

        listings = [listing for _, listing in sorted(indexed_listings, key=lambda item: item[0])]
        errors = [error for _, error in sorted(indexed_errors, key=lambda item: item[0])]
        source_stats = [
            source.build_source_stats(
                logged_in=logged_in,
                num_listings=len(listings),
                num_errors=len(errors),
            )
        ]
        result = AllListingsResponse(
            listings=listings,
            errors=errors,
            source_stats=source_stats,
        )

        logger.info(
            f"[{source.source_id}] Parsed {len(listings)} listings with {len(errors)} errors "
            f"in {time.time() - started_at:.2f} seconds "
            f"(index items available: {total_index_items}, parsed: {total})"
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
                source_stats=source_stats,
            ),
            data=result,
        )
        return result


async def scrape_listings_with_options(
    sources: list[ListingSource],
    options: ListingsSearchOptions,
    progress_callback: ProgressCallback | None = None,
) -> AllListingsResponse:
    """Scrape all requested sources in parallel and emit aggregate progress."""

    progress_by_source: dict[Any, ScrapeProgress] = {}

    async def emit_aggregate_progress(event: ListingsStreamEvent) -> None:
        if progress_callback is None:
            return

        progress_by_source[event.progress.source] = event.progress
        aggregate_stats = _merge_source_stats([
            stat for progress in progress_by_source.values() for stat in progress.source_stats
        ])
        aggregate_progress = ScrapeProgress(
            status="progress" if event.event == "complete" else event.progress.status,
            current=sum(progress.current for progress in progress_by_source.values()),
            total=sum(progress.total for progress in progress_by_source.values()),
            errors=sum(progress.errors for progress in progress_by_source.values()),
            listing_id=event.progress.listing_id,
            source=event.progress.source,
            source_stats=aggregate_stats,
            message=event.progress.message,
        )
        await progress_callback(
            ListingsStreamEvent(
                event="progress" if event.event == "complete" else event.event,
                progress=aggregate_progress,
                data=None,
            )
        )

    async def scrape_one_source(source: ListingSource) -> AllListingsResponse:
        try:
            return await scrape_source_listings(
                source=source,
                options=options,
                progress_callback=emit_aggregate_progress,
            )
        except Exception as error:
            logger.exception("[%s] Source scrape failed", source.source_id)
            failed_result = AllListingsResponse(
                listings=[],
                errors=[
                    ListingParseError(
                        id=f"{source.source_id}:source-error",
                        source=source.source_id,
                        source_local_id="source-error",
                        url=source.global_url,
                        reason=str(error),
                    )
                ],
                source_stats=[
                    source.build_source_stats(logged_in=None, num_listings=0, num_errors=1)
                ],
            )
            if progress_callback is not None:
                await emit_aggregate_progress(
                    ListingsStreamEvent(
                        event="progress",
                        progress=ScrapeProgress(
                            status="progress",
                            current=0,
                            total=0,
                            errors=1,
                            source=source.source_id,
                            source_stats=failed_result.source_stats,
                            message=str(error),
                        ),
                    )
                )
            return failed_result

    results = await asyncio.gather(*(scrape_one_source(source) for source in sources))
    merged_result = _merge_responses(results)
    if progress_callback is not None:
        aggregate_stats = _merge_source_stats([
            stat for result in results for stat in result.source_stats
        ])
        await progress_callback(
            ListingsStreamEvent(
                event="complete",
                progress=ScrapeProgress(
                    status="complete",
                    current=sum(len(result.listings) + len(result.errors) for result in results),
                    total=sum(len(result.listings) + len(result.errors) for result in results),
                    errors=sum(len(result.errors) for result in results),
                    source_stats=aggregate_stats,
                ),
                data=merged_result,
            )
        )
    return merged_result
