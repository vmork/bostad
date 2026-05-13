import asyncio
import time
import sys
from app.scraping.sources.qasa import QasaSource
from app.scraping.client import create_async_client

async def benchmark():
    source = QasaSource()
    # create_async_client is sync based on grep but we will handle it
    client = create_async_client()
    try:
        print(f"Fetching listings for Stockholm county...")
        # Note: we might need to adjust the location_id or search parameters
        # based on the actually implemented 'search' method.
        # This is a guestimate based on common Qasa API usage.
        # If location_ids aren't supported, we use an empty list or default.
        listings = await source.search(client, limit=1200)
        print(f"Found {len(listings)} listings.")
        
        target_count = min(len(listings), 1200)
        to_process = listings[:target_count]
        
        semaphore = asyncio.Semaphore(source.detail_fetch_concurrency)
        success_count = 0
        fail_count = 0
        rate_limit_count = 0
        
        start_time = time.perf_counter()
        
        async def process(listing):
            nonlocal success_count, fail_count, rate_limit_count
            async with semaphore:
                try:
                    await source.parse_listing(client, listing)
                    success_count += 1
                except Exception as e:
                    fail_count += 1
                    err_msg = str(e)
                    if "429" in err_msg or "Too Many Requests" in err_msg:
                        rate_limit_count += 1

        await asyncio.gather(*(process(l) for l in to_process))
        
        end_time = time.perf_counter()
        duration = end_time - start_time
        
        print(f"--- Benchmark Results ---")
        print(f"Total time: {duration:.2f}s")
        print(f"Success: {success_count}")
        print(f"Failed: {fail_count}")
        print(f"Rate limited (429): {rate_limit_count}")
        
        # Estimate batches
        batch_size = getattr(source, 'detail_batch_size', 50)
        estimated_batches = (success_count + fail_count + batch_size - 1) // batch_size
        print(f"Estimated GraphQL batches: {estimated_batches}")
    finally:
        await client.aclose()

if __name__ == "__main__":
    asyncio.run(benchmark())
