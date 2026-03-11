import asyncio
from collections.abc import AsyncIterator
from contextlib import suppress

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse

from app.models import AllListingsResponse, ListingsStreamEvent, ScrapeProgress
from app.scrape_bostad_sthlm import ListingsFetchException, scrape_all_listings

app = FastAPI(title="Bostad API")


def _encode_sse(event: ListingsStreamEvent) -> str:
    payload = event.model_dump_json(by_alias=True, exclude_none=True)
    return f"event: {event.event}\ndata: {payload}\n\n"


@app.get("/api/all_listings")
async def all_listings() -> AllListingsResponse:
    try:
        return await scrape_all_listings()
    except ListingsFetchException as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/api/all_listings/stream")
async def all_listings_stream() -> StreamingResponse:
    queue: asyncio.Queue[ListingsStreamEvent | None] = asyncio.Queue()
    last_progress: ScrapeProgress | None = None

    async def emit_progress(event: ListingsStreamEvent) -> None:
        nonlocal last_progress
        last_progress = event.progress
        await queue.put(event)

    async def run_scrape() -> None:
        nonlocal last_progress
        try:
            await scrape_all_listings(progress_callback=emit_progress)
        except Exception as error:
            progress = last_progress or ScrapeProgress(status="failed", current=0, total=0)
            await queue.put(
                ListingsStreamEvent(
                    event="failed",
                    progress=progress.model_copy(update={"status": "failed", "message": str(error)}),
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
