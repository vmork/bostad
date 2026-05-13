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

HOME_SEARCH_QUERY = """
query HomeSearch($order: HomeIndexSearchOrderInput, $offset: Int, $limit: Int, $params: HomeSearchParamsInput) {
  homeIndexSearch(order: $order, params: $params) {
    documents(offset: $offset, limit: $limit) {
      nodes { id }
    }
  }
}
"""

HOME_DETAIL_QUERY = "query Home($id: ID!) { home(id: $id) { id description } }"

async def fetch(client, query, variables):
    return await client.post(URL, json={"query": query, "variables": variables})

async def main():
    async with httpx.AsyncClient(headers=HEADERS, timeout=30.0) as client:
        resp = await fetch(client, HOME_SEARCH_QUERY, {"limit": 100})
        ids = [node["id"] for node in resp.json()["data"]["homeIndexSearch"]["documents"]["nodes"]]
        print(f"Fetched {len(ids)} IDs")

        print("Testing rapid fire (50 requests, 10 at a time)...")
        for i in range(5):
            tasks = [fetch(client, HOME_DETAIL_QUERY, {"id": id_}) for id_ in ids[i*10:(i+1)*10]]
            results = await asyncio.gather(*tasks)
            status_counts = {}
            for r in results:
                status_counts[r.status_code] = status_counts.get(r.status_code, 0) + 1
            print(f"Batch {i+1}: {status_counts}")
            if 429 in status_counts:
                for r in results:
                    if r.status_code == 429:
                        print(f"429 Headers: {dict(r.headers)}")
                        break
                # Try index search while limited
                idx_resp = await fetch(client, HOME_SEARCH_QUERY, {"limit": 1})
                print(f"Index search status while limited: {idx_resp.status_code}")
            await asyncio.sleep(0.1)

        print("\nTesting larger batch (50 IDs in one request)...")
        batch_query = "query BatchedHome {"
        for i, id_ in enumerate(ids[:50]):
            batch_query += f"h{i}: home(id: \"{id_}\") {{ id description }}\n"
        batch_query += "}"
        resp = await fetch(client, batch_query, {})
        print(f"Large batch (50 IDs) status: {resp.status_code}")
        if resp.status_code == 200:
            print(f"Large batch keys: {len(resp.json().get('data', {}))}")
        else:
            print(f"Large batch error: {resp.text}")

if __name__ == "__main__":
    asyncio.run(main())
