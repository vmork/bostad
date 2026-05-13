import httpx
import time
import asyncio
import sys

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
      nodes {
        id
      }
    }
  }
}
"""

HOME_DETAIL_QUERY = """
query Home($id: ID!) {
  home(id: $id) {
    id
    description
  }
}
"""

async def fetch(client, query, variables):
    resp = await client.post(URL, json={"query": query, "variables": variables})
    return resp

async def main():
    async with httpx.AsyncClient(headers=HEADERS) as client:
        # Get some IDs
        resp = await fetch(client, HOME_SEARCH_QUERY, {"limit": 50})
        if resp.status_code != 200:
            print(f"Index failed: {resp.status_code}")
            return
        ids = [node["id"] for node in resp.json()["data"]["homeIndexSearch"]["documents"]["nodes"]]
        print(f"Fetched {len(ids)} IDs")

        # Test A: Rate limit per second/burst
        print("Testing burst rate...")
        tasks = [fetch(client, HOME_DETAIL_QUERY, {"id": id_}) for id_ in ids[:20]]
        results = await asyncio.gather(*tasks)
        status_counts = {}
        for r in results:
            status_counts[r.status_code] = status_counts.get(r.status_code, 0) + 1
        print(f"Burst Results (20 concurrent): {status_counts}")
        
        for r in results:
            if r.status_code == 429:
                print(f"429 Headers: {dict(r.headers)}")
                print(f"429 Body: {r.text}")
                break

        # Test E: Batching with aliases
        print("Testing batched request...")
        batch_query = "query BatchedHome {"
        for i, id_ in enumerate(ids[:10]):
            batch_query += f"home_{i}: home(id: \"{id_}\") {{ id description }}\n"
        batch_query += "}"
        resp = await fetch(client, batch_query, {})
        print(f"Batched Request (10 IDs) status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json().get("data", {})
            print(f"Batched successes: {len(data)}")

if __name__ == "__main__":
    asyncio.run(main())
