### Search params ex
'{"sorting":"rent.asc","geo_bounds":{"min_lat":59.25127433952525,"min_lng":18.044166768077616,"max_lat":59.36668648939062,"max_lng":18.136355157204065},"zoom":11.42,"page":1,"amount":10}'

### Search result ex
- when page > maxpage, returns expty results
```json
{
  "results": [
    {
      "id": 249000,
      "references": {
        "estate": 3185,
        "apartment": 56801,
        "object_ad": 249000,
        "company": 59,
        "office": 838,
        "project": null
      },
      "type": "individual",
      "uri": "/lagenhet/249000-1rum-bandhagen-stockholms-l\u00e4n-st\u00e5lbogav\u00e4gen-16",
      "municipality": "Stockholm",
      "county": "Stockholms l\u00e4n",
      "city": "Bandhagen",
      "location": { "lat": 59.2638178, "lon": 18.0497043 },
      "images": [
        {
          "image": "https://homeq-media-live.s3.amazonaws.com/estate_images/d12f52ade2d34f089b3e5d8462f6730e.jpeg",
          "caption": "",
          "position": 0
        },
        {
          "image": "https://homeq-media-live.s3.amazonaws.com/estate_images/5e99291d18764833a7381131936ddd38.jpeg",
          "caption": "",
          "position": 1
        },
        {
          "image": "https://homeq-media-live.s3.amazonaws.com/estate_images/7d09263c1d014e7499059ed326074bd5.jpeg",
          "caption": "",
          "position": 2
        },
        {
          "image": "https://homeq-media-live.s3.amazonaws.com/estate_images/529f2c53161c4b2bb66959429afe6177.jpeg",
          "caption": "",
          "position": 3
        }
      ],
      "videos": [],
      "boost_value": 1.39,
      "discount": null,
      "title": "St\u00e5lbogav\u00e4gen 16",
      "audience": "everyone",
      "is_short_lease": false,
      "early_access": null,
      "rent": 5462,
      "rooms": 1.0,
      "area": 25.0,
      "date_access": "2026-07-01",
      "is_quick_apply": false
    },
    {
      "id": 249612,
      "references": {
        "estate": 9160,
        "apartment": 204315,
        "object_ad": 249612,
        "company": 741,
        "office": 2042,
        "project": null
      },
      "type": "individual",
      "uri": "/lagenhet/249612-1rum-stockholm-stockholms-l\u00e4n-v\u00e4stmannagatan-15",
      "municipality": "Stockholm",
      "county": "Stockholms l\u00e4n",
      "city": "Stockholm",
      "location": { "lat": 59.3372393, "lon": 18.0517401 },
      "images": [
        {
          "image": "https://homeq-media-live.s3.amazonaws.com/apartment_images/f495ce36faed43e5a63b4aa783d7145a.png",
          "caption": "Exempelbild studentrum",
          "position": 0
        },
      ],
      "videos": [],
      "boost_value": 0,
      "discount": null,
      "title": "V\u00e4stmannagatan 15",
      "audience": "youth",
      "is_short_lease": true,
      "early_access": null,
      "rent": 5511,
      "rooms": 1.0,
      "area": 20.0,
      "date_access": "2026-05-05",
      "is_quick_apply": false
    },
  ],
  "total_hits": 2
}
```

### Single page params ex
- Köpoäng data:
    - https://api.homeq.se/api/v3/free_insights/249000/
    - Response:
        ```json
        {
        "is_using_soft_requirements": false,
        "frame": "queue_points_info",
        "queue_points_top_10": 2094
        }
        ```
- Allmänt:
    - https://api.homeq.se/api/v1/object/249000 
    - Response:
        ```json
        {
            "object_ad": {
                "campaign_id": null,
                "is_renovated": false,
                "heat_included": true,
                "water_included": true,
                "cold_and_warm_water_included": "ALL_INCLUDED",
                "electricity_included": false,
                "tv_included": false,
                "internet_included": false,
                "has_washing_machine": false,
                "is_prepared_for_washing_machine": false,
                "is_prioritizing_company_customers": false,
                "has_dishwasher": false,
                "is_prepared_for_dishwasher": false,
                "has_drier": false,
                "is_prepared_for_drier": false,
                "has_bathtub": false,
                "is_prepared_for_bathtub": false,
                "has_shower": true,
                "has_kitchen_fan": false,
                "is_prepared_for_kitchen_fan": false,
                "has_pentry": false,
                "has_laundry_room": true,
                "is_accessibility_adapted": false,
                "has_patio": false,
                "has_balcony": false,
                "balcony": "NONE",
                "has_elevator": true,
                "has_parking": false,
                "parking": "NONE",
                "has_garage": false,
                "garage": "NONE",
                "city": "Bandhagen",
                "street": "St\u00e5lbogav\u00e4gen",
                "street_number": "16",
                "zip_code": "12456",
                "municipality": "Stockholm",
                "county": "Stockholms l\u00e4n",
                "rooms": "1.0",
                "get_rooms": "1",
                "floor": 3,
                "area": "25.00",
                "rent": 5462,
                "description": "1 rum med kokvr\u00e5 om 25 kvm.\nBostaden har en praktisk planl\u00f6sning med kombinerat rum f\u00f6r b\u00e5de s\u00e4ng och vardagsdel samt en kokvr\u00e5 i anslutning. N\u00e4rhet till kommunikationer och service. \n\nL\u00e4genheten saknar balkong.\n\nExternt f\u00f6rr\u00e5d finns.\n",
                "status": "a",
                "promotion_file": null,
                "plan_image": null,
                "images": [
                    {
                        "image": "https://homeq-media-live.s3.amazonaws.com/estate_images/d12f52ade2d34f089b3e5d8462f6730e.jpeg",
                        "caption": "",
                        "position": 0
                    },
                    {
                        "image": "https://homeq-media-live.s3.amazonaws.com/estate_images/5e99291d18764833a7381131936ddd38.jpeg",
                        "caption": "",
                        "position": 1
                    },
                    {
                        "image": "https://homeq-media-live.s3.amazonaws.com/estate_images/7d09263c1d014e7499059ed326074bd5.jpeg",
                        "caption": "",
                        "position": 2
                    },
                    {
                        "image": "https://homeq-media-live.s3.amazonaws.com/estate_images/529f2c53161c4b2bb66959429afe6177.jpeg",
                        "caption": "",
                        "position": 3
                    }
                ],
                "videos": [],
                "three_d_views": [],
                "agreement_access": false,
                "prior_access": false,
                "landlord_logo": "https://homeq-media-live.s3.eu-north-1.amazonaws.com/landlord_offices/logos/bfaa6e1321674083911b5fb1f9f8cf97.jpg",
                "landlord_company": "Ikano Bostad",
                "landlord_is_mini": false,
                "public_profile_slug": "ikano-bostad",
                "date_access": "2026-07-01",
                "can_apply": true,
                "longitude": "18.0497043",
                "latitude": "59.2638178",
                "date_publish": "2026-04-08",
                "republish_date": null,
                "discount": null,
                "new_production": false,
                "project_id": null,
                "estate_id": 3185,
                "area_description": null,
                "landlord_object_id": "906-1723",
                "has_applied_on_estate": true,
                "is_short_lease": false,
                "security_door": true,
                "short_lease_min_date": null,
                "short_lease_max_date": null,
                "contract_system": "B",
                "is_senior": false,
                "capacity": 3,
                "senior_age": 65,
                "is_youth": false,
                "youth_age": 25,
                "is_student": false,
                "allows_smoking": true,
                "allows_pets": true,
                "candidate_sorting_mode": "queue_points",
                "handicap_friendly": false,
                "office": {
                    "id": 838
                },
                "landlord": {
                    "id": 59
                },
                "is_quick_apply": false,
                "early_access": null
            }
        }
        ```