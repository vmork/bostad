## Index request
- url: https://api.homeq.se/api/v3/search
- params ex (paginated):
'{"sorting":"rent.asc","geo_bounds":{"min_lat":59.25127433952525,"min_lng":18.044166768077616,"max_lat":59.36668648939062,"max_lng":18.136355157204065},"zoom":11.42,"page":1,"amount":10}'
- when page > maximum page, returns empty result
- reponse: {
    results: (see scratch/homeq_search_1.json)
    total_hits: 1234
  }

## Single page requests
- General listing info:
    - https://api.homeq.se/api/v1/{uri}
    - Response ex: see scratch/homeq_listing_json_1.json:
- More specific queue data:
    - https://api.homeq.se/api/v3/free_insights/{id}/
    - Response ex:
        ```json
        {
        "is_using_soft_requirements": false,  // not sure
        "frame": "queue_points_info",  // not sure
        "queue_points_top_10": 2094  // number of queue points that the 10th person in line has
        }
        ```


Stockholms län bounds
{
    "min_lat": 58.45344707379502,
    "min_lng": 17.305693841571127,
    "max_lat": 60.210992582819785,
    "max_lng": 19.596968817307214
}