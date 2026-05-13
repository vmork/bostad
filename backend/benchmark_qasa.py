import asyncio
import time
from collections import Counter
from app.scraping.sources.qasa import QasaSource
from app.scraping.client import create_async_client
from app.models import ListingsSearchOptions, ListingSources, QasaSearchOptions

async def benchmark():
    client = create_async_client()
    source = QasaSource()
    
    request_counts = Counter()
    status_429_count = 0
    
    original_request = client.request
    async def instrumented_request(method, url, **kwargs):
        nonlocal status_429_count
        # Basic GraphQL operation detection
        if kwargs.get('json') and 'operationName' in kwargs['json']:
            op = kwargs['json']['operationName']
            request_counts[f"graphql:{op}"] += 1
        else:
            request_counts[f"{method}:{url[:50]}"] += 1
            
        resp = await original_request(method, url, **kwargs)
        if resp.status_code == 429:
            status_429_count += 1
        return resp
    
    client.request = instrumented_request

    start_time = time.time()
    
    # 1. Fetch Index (using correct argument order: client, options)
    options = ListingsSearchOptions(sources=[ListingSources.QASA])
    index_items = await source.fetch_listing_index(client, options)
    index_count = len(index_items)
    
    # 2. Parse first 1200 items
    to_parse = index_items[:1200]
    semaphore = asyncio.Semaphore(source.detail_fetch_concurrency)
    
    success_count = 0
    error_count = 0
    
    async def parse_task(item):
        nonlocal success_count, error_count
        async with semaphore:
            try:
                listing = await source.parse_listing(item, client)
                if listing:
                    success_count += 1
                else:
                    error_count += 1
            except Exception:
                error_count += 1

    await asyncio.gather(*(parse_task(item) for item in to_parse))
    
    elapsed = time.time() - start_time
    
    print(f"Index count: {index_count}")
    print(f"Parsed success: {success_count}")
    print(f"Errors: {error_count}")
    print(f"Elapsed: {elapsed:.2f}s")
    print(f"Requests: {dict(request_counts)}")
    print(f"429s encountered: {status_429_count > 0} ({status_429_count})")

if __name__ == "__main__":
    asyncio.run(benchmark())
