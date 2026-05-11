import asyncio
from collections.abc import AsyncIterator
from contextlib import suppress
from datetime import UTC, datetime

from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import StreamingResponse

from app.listings_cache import read_cached_all_listings
from app.logging_config import configure_logging
from app.models import (
    AllListingsResponse,
    ListingsSearchOptions,
    ListingsStreamEvent,
    ScrapeProgress,
)
from app.scraping.core import scrape_listings_with_options
from app.scraping.registry import get_listing_sources
from app.scraping.scrape_utils import ListingsFetchException

configure_logging()

app = FastAPI(title="Bostad API")


def _encode_sse(event: ListingsStreamEvent) -> str:
    payload = event.model_dump_json(by_alias=True, exclude_none=True)
    return f"event: {event.event}\ndata: {payload}\n\n"


def _stamp_updated_at(response: AllListingsResponse) -> AllListingsResponse:
    return response.model_copy(update={"updated_at": datetime.now(UTC)})


@app.get("/api/all_listings", response_model=AllListingsResponse)
async def all_listings() -> AllListingsResponse | Response:
    cached_response = read_cached_all_listings()
    if cached_response is not None:
        return cached_response
    return Response(status_code=204)


@app.post("/api/all_listings")
async def all_listings_post(options: ListingsSearchOptions) -> AllListingsResponse:
    return await _all_listings_with_options(options)


async def _all_listings_with_options(
    options: ListingsSearchOptions,
) -> AllListingsResponse:
    try:
        response = await scrape_listings_with_options(get_listing_sources(options.sources), options)
        return _stamp_updated_at(response)
    except ListingsFetchException as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/api/all_listings/stream")
async def all_listings_stream() -> StreamingResponse:
    return await _all_listings_stream_with_options(ListingsSearchOptions())


@app.post("/api/all_listings/stream")
async def all_listings_stream_post(options: ListingsSearchOptions) -> StreamingResponse:
    return await _all_listings_stream_with_options(options)


async def _all_listings_stream_with_options(
    options: ListingsSearchOptions,
) -> StreamingResponse:
    queue: asyncio.Queue[ListingsStreamEvent | None] = asyncio.Queue()
    last_progress: ScrapeProgress | None = None

    async def emit_progress(event: ListingsStreamEvent) -> None:
        nonlocal last_progress
        last_progress = event.progress
        await queue.put(event)

    async def run_scrape() -> None:
        nonlocal last_progress
        try:
            await scrape_listings_with_options(
                sources=get_listing_sources(options.sources),
                options=options,
                progress_callback=emit_progress,
            )
        except Exception as error:  # noqa: BLE001
            progress = last_progress or ScrapeProgress(status="failed", current=0, total=0)
            await queue.put(
                ListingsStreamEvent(
                    event="failed",
                    progress=progress.model_copy(
                        update={"status": "failed", "message": str(error)}
                    ),
                )
            )
        finally:
            await queue.put(None)

    scrape_task = asyncio.create_task(run_scrape())

    async def stream() -> AsyncIterator[str]:
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield _encode_sse(event)
        finally:
            if not scrape_task.done():
                scrape_task.cancel()
                with suppress(asyncio.CancelledError):
                    await scrape_task

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
