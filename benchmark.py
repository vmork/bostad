import json
import time
import urllib.request
import urllib.error

URL = "https://api.qasa.se/graphql"
QUERY = """
query HomeSearch($order: HomeIndexSearchOrderInput, $offset: Int, $limit: Int, $params: HomeSearchParamsInput) {
  homeIndexSearch(order: $order, params: $params) {
    documents(offset: $offset, limit: $limit) {
      hasNextPage
      hasPreviousPage
      nodes {
        id
        publishedOrBumpedAt
      }
      pagesCount
      totalCount
      __typename
    }
    __typename
  }
}
"""
BASE_VARIABLES = {
    "order": {"direction": "descending", "orderBy": "published_or_bumped_at"},
    "params": {"currency": "SEK", "areaIdentifier": ["se/stockholm_county"], "markets": ["sweden"]}
}

LIMITS = [25, 50, 59, 100, 150, 200]

def post_graphql(query, variables, operation_name):
    data = json.dumps({"query": query, "variables": variables, "operationName": operation_name}).encode('utf-8')
    req = urllib.request.Request(URL, data=data, headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as f:
        return json.loads(f.read().decode('utf-8'))

def run_benchmark():
    results = []
    
    for limit in LIMITS:
        offset = 0
        total_fetched = 0
        requests_count = 0
        ids = set()
        duplicates = 0
        start_time = time.time()
        failures = 0
        total_expected = None
        first_batch_size = None
        
        while True:
            variables = BASE_VARIABLES.copy()
            variables.update({"limit": limit, "offset": offset})
            
            try:
                data = post_graphql(QUERY, variables, "HomeSearch")
                
                if "errors" in data:
                    failures += 1
                    break
                
                docs = data["data"]["homeIndexSearch"]["documents"]
                nodes = docs["nodes"]
                total_expected = docs["totalCount"]
                
                if first_batch_size is None:
                    first_batch_size = len(nodes)
                
                requests_count += 1
                total_fetched += len(nodes)
                
                for node in nodes:
                    node_id = node["id"]
                    if node_id in ids:
                        duplicates += 1
                    ids.add(node_id)
                
                if not docs["hasNextPage"] or not nodes or (limit > 0 and len(nodes) < limit):
                    break
                
                offset += len(nodes)
                if requests_count > 500: break
                    
            except Exception as e:
                failures += 1
                break
        
        elapsed = time.time() - start_time
        results.append({
            "limit": limit,
            "requests": requests_count,
            "fetched": total_fetched,
            "total_count": total_expected,
            "seconds": round(elapsed, 2),
            "duplicates": duplicates,
            "failures": failures,
            "first_batch": first_batch_size
        })
        
    print("\nResults:")
    print("Limit | Requests | Fetched | TotalCount | Seconds | Duplicates | Failures | First Batch")
    print("-" * 95)
    for r in results:
        print(f"{r['limit']:5} | {r['requests']:8} | {r['fetched']:7} | {r['total_count']:10} | {r['seconds']:7} | {r['duplicates']:10} | {r['failures']:8} | {r['first_batch']}")

if __name__ == "__main__":
    run_benchmark()
