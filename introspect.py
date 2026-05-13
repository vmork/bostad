import json
import urllib.request

URL = "https://api.qasa.se/graphql"
QUERY = """
{
  __type(name: "HomeSearchQueryResult") {
    name
    fields {
      name
    }
  }
}
"""
payload = json.dumps({"query": QUERY}).encode("utf-8")
req = urllib.request.Request(URL, data=payload, headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req) as res:
    print(res.read().decode())
