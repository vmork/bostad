import asyncio
import time
from collections import Counter
from app.scraping.sources.qasa import QasaSource
from app.scraping.client import create_async_client
from app.models import ListingsSearchOptions, ListingSources

async def benchmark():
    client = create_async_client()
    source = QasaSource()
    
    request_counts = Counter()
    status_429_count = 0
    
    original_request = client.request
    async def instrumented_request(method, url, **kwargs):
        nonlocal status_429_count
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
    
    try:
        # 1. Fetch Index
        options = ListingsSearchOptions(sources=[ListingSources.QASA])
        index_items = await source.fetch_listing_index(client, options)
        index_count = len(index_items)
        
        # 2. Parse all items
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

        await asyncio.gather(*(parse_task(item) for item in index_items))
        
        elapsed = time.time() - start_time
        
        print(f"Total entries in index: {index_count}")
        print(f"Successfully parsed: {success_count}")
        print(f"Errors encountered: {error_count}")
        print(f"Total time elapsed: {elapsed:.2f}s")
        print(f"Request counts by operation: {dict(request_counts)}")
        print(f"429 Rate Limited: {'Yes' if status_429_count > 0 else 'No'} ({status_429_count} occurrences)")
    except Exception as e:
        print(f"Benchmark failed during execution: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(benchmark())
