import httpx
import asyncio
import time

URL = "https://api.qasa.se/graphql"
HEADERS = {
    "accept": "*/*",
    "content-type": "application/json",
    "origin": "https://qasa.com",
    "referer": "https://qasa.com/",
    "user-agent": "Mozilla/5.0",
}

HOME_SEARCH_QUERY = "query HomeSearch($limit: Int) { homeIndexSearch(params: {}) { documents(limit: $limit) { nodes { id } } } }"
HOME_DETAIL_QUERY = "query Home($id: ID!) { home(id: $id) { id description } }"

async def fetch(client, query, variables):
    return await client.post(URL, json={"query": query, "variables": variables})

async def main():
    async with httpx.AsyncClient(headers=HEADERS, timeout=60.0) as client:
        # Get 200 IDs
        resp = await fetch(client, HOME_SEARCH_QUERY, {"limit": 200})
        ids = [node["id"] for node in resp.json()["data"]["homeIndexSearch"]["documents"]["nodes"]]
        print(f"Fetched {len(ids)} IDs")

        print("Testing 200 concurrent requests...")
        tasks = [fetch(client, HOME_DETAIL_QUERY, {"id": id_}) for id_ in ids]
        start = time.time()
        results = await asyncio.gather(*tasks)
        end = time.time()
        
        status_counts = {}
        for r in results:
            status_counts[r.status_code] = status_counts.get(r.status_code, 0) + 1
        print(f"Results (Concurrency 200): {status_counts} in {end-start:.2f}s")

        print("\nTesting 200 IDs in one batch...")
        batch_query = "query BatchedHome {"
        for i, id_ in enumerate(ids):
            batch_query += f"h{i}: home(id: \"{id_}\") {{ id description }}\n"
        batch_query += "}"
        resp = await fetch(client, batch_query, {})
        print(f"Batch(200) status: {resp.status_code}")
        if resp.status_code == 200:
            print(f"Batch(200) successes: {len(resp.json().get('data', {}))}")

if __name__ == "__main__":
    asyncio.run(main())
