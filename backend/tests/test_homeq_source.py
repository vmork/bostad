import json
from datetime import datetime
from typing import Any

import httpx
import pytest

from app.models import HomeQSearchOptions, ListingSources, ListingsSearchOptions
from app.scraping.sources.homeq import (
    HomeQSource,
    OBJECT_DETAIL_RATE_LIMIT_COOLDOWN_SECONDS,
    OBJECT_DETAIL_REQUEST_INTERVAL_SECONDS,
)


def _homeq_source() -> HomeQSource:
    return HomeQSource()


def _homeq_options(max_listings: int | None = None) -> ListingsSearchOptions:
    return ListingsSearchOptions(
        sources=[ListingSources.HOMEQ],
        homeq=HomeQSearchOptions(max_listings=max_listings),
    )


def _project_search_item(**overrides: Any) -> dict[str, Any]:
    item = {
        "id": 1158,
        "references": {"company": 362, "office": 562, "project": 1158},
        "type": "project",
        "uri": "/projekt/1158",
        "municipality": "Järfälla",
        "county": "Stockholms län",
        "city": "Järfälla",
        "location": {"lat": 59.4038659, "lon": 17.8557312},
        "images": [
            {
                "image": "https://homeq-media-live.s3.amazonaws.com/project_images/example.jpeg",
                "caption": "",
                "position": 0,
            }
        ],
        "videos": [],
        "boost_value": 0,
        "discount": None,
        "title": "Kvarter Älvan",
        "audience": ["everyone"],
        "is_short_lease": False,
        "has_discount": False,
        "rent_range": [7004, 20192],
        "active_ads": 14,
        "date_access": "2025-12-01",
    }
    item.update(overrides)
    return item


def _individual_search_item(**overrides: Any) -> dict[str, Any]:
    item = {
        "id": 251059,
        "references": {
            "estate": 20293,
            "apartment": 284983,
            "object_ad": 251059,
            "company": 1417,
            "office": 2326,
            "project": None,
        },
        "type": "individual",
        "uri": "/lagenhet/251059-2rum-stockholm-stockholms-län-birger-jarlsgatan-127",
        "municipality": "Stockholm",
        "county": "Stockholms län",
        "city": "Stockholm",
        "location": {"lat": 59.3506306, "lon": 18.057292},
        "images": [
            {
                "image": "https://homeq-media-live.s3.amazonaws.com/estate_images/51fd.jpeg",
                "caption": "",
                "position": 0,
            }
        ],
        "videos": [],
        "boost_value": 0,
        "discount": None,
        "title": "Birger Jarlsgatan 127",
        "audience": "everyone",
        "is_short_lease": True,
        "early_access": None,
        "rent": 10388,
        "rooms": 2.0,
        "area": 55.0,
        "date_access": "2026-07-01",
        "is_quick_apply": False,
    }
    item.update(overrides)
    return item


@pytest.mark.asyncio
async def test_homeq_fetch_listing_index_paginates_and_skips_projects_without_ranges() -> None:
    source = _homeq_source()
    requested_pages: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert str(request.url) == "https://api.homeq.se/api/v3/search"
        payload = json.loads(request.content.decode("utf-8"))
        requested_pages.append(payload["page"])

        if payload["page"] == 1:
            body = {
                "results": [
                    _individual_search_item(
                        id=1,
                        county="Uppsala län",
                        municipality="Uppsala",
                        city="Uppsala",
                        uri="/lagenhet/1-1rum-uppsala-uppsala-län-testgatan-1",
                    ),
                    _project_search_item(),
                    _project_search_item(id=9999, uri="/projekt/9999", rent_range=[]),
                    _individual_search_item(),
                ],
                "total_hits": 3,
            }
        elif payload["page"] == 2:
            body = {
                "results": [
                    _individual_search_item(
                        id=225460,
                        references={
                            "estate": 17002,
                            "apartment": 272491,
                            "object_ad": 225460,
                            "company": 3073,
                            "office": 4051,
                            "project": None,
                        },
                        uri="/lagenhet/225460-2rum-täby-stockholms-län-gamla-norrtäljevägen-127",
                    )
                ],
                "total_hits": 3,
            }
        else:
            body = {"results": [], "total_hits": 3}

        return httpx.Response(200, json=body)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        items = await source.fetch_listing_index(client, _homeq_options())

    assert [item["id"] for item in items] == [1158, 251059, 225460]
    assert requested_pages == [1, 2, 3]


@pytest.mark.asyncio
async def test_homeq_parse_individual_listing_uses_object_payload_only() -> None:
    source = _homeq_source()
    search_item = _individual_search_item()

    object_payload = {
        "object_ad": {
            "city": "Stockholm",
            "street": "Birger Jarlsgatan",
            "street_number": "127",
            "municipality": "Stockholm",
            "county": "Stockholms län",
            "rooms": "2.0",
            "floor": 1,
            "area": "55.00",
            "rent": 10388,
            "description": "Lägenhet är belägen nära intill grönområden, vatten, kommunikationer och närbutik.",
            "images": [
                {
                    "image": "https://homeq-media-live.s3.amazonaws.com/estate_images/51fd.jpeg",
                    "caption": "",
                    "position": 0,
                }
            ],
            "videos": [],
            "agreement_access": False,
            "prior_access": False,
            "landlord_company": "Bergsundet",
            "date_access": "2026-07-01",
            "can_apply": True,
            "longitude": "18.0572920",
            "latitude": "59.3506306",
            "date_publish": "2026-04-22",
            "tenantBaseFee": 500,
            "discount": None,
            "new_production": False,
            "project_id": None,
            "estate_id": 20293,
            "area_description": "Staren 11 är en klassisk bostadsfastighet på Norrmalm.",
            "landlord_object_id": "9200122",
            "has_applied_on_estate": True,
            "is_short_lease": True,
            "short_lease_min_date": "2030-06-30",
            "short_lease_max_date": "2030-06-30",
            "contract_system": "B",
            "is_senior": False,
            "capacity": 3,
            "senior_age": 65,
            "is_youth": False,
            "youth_age": 25,
            "is_student": False,
            "allows_smoking": False,
            "allows_pets": True,
            "candidate_sorting_mode": "queue_points",
            "handicap_friendly": False,
            "office": {"id": 2326},
            "landlord": {"id": 1417},
            "is_quick_apply": False,
            "early_access": None,
            "has_balcony": False,
            "has_elevator": True,
            "has_dishwasher": False,
            "has_washing_machine": False,
            "has_drier": False,
            "plan_image": None,
        }
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert str(request.url) == "https://api.homeq.se/api/v1/object/251059"
        return httpx.Response(200, json=object_payload)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        listing = await source.parse_listing(search_item, client)

    assert listing.id == "homeq:251059"
    assert listing.source == ListingSources.HOMEQ
    assert listing.source_local_id == "251059"
    assert (
        listing.url
        == "https://www.homeq.se/lagenhet/251059-2rum-stockholm-stockholms-län-birger-jarlsgatan-127"
    )
    assert listing.name == "Birger Jarlsgatan 127"
    assert listing.loc_municipality == "Stockholm"
    assert listing.loc_district == "Stockholm"
    assert listing.rent == 10888
    assert listing.area_sqm == 55
    assert listing.num_rooms == 2
    assert listing.apartment_type == "regular"
    assert listing.floor == 1
    assert listing.coords is not None
    assert listing.coords.lat == 59.3506306
    assert listing.coords.long == 18.057292
    assert listing.date_posted == datetime.fromisoformat("2026-04-22")
    assert listing.lease_start_date == "2026-07-01"
    assert listing.lease_end_date == "2030-06-30"
    assert listing.free_text is not None
    assert "Lägenhet är belägen nära intill grönområden" in listing.free_text
    assert "Staren 11 är en klassisk bostadsfastighet" in listing.free_text
    assert listing.image_urls == [
        "https://homeq-media-live.s3.amazonaws.com/estate_images/51fd.jpeg"
    ]
    assert listing.floorplan_url is None
    assert listing.features.balcony is False
    assert listing.features.elevator is True
    assert listing.features.new_production is False
    assert listing.features.has_pictures is True
    assert listing.features.has_floorplan is False
    assert listing.allocation_info is not None
    assert listing.allocation_info.allocation_method == "queue_points"


@pytest.mark.asyncio
async def test_homeq_parse_project_listing_builds_multi_apartment_listing() -> None:
    source = _homeq_source()
    search_item = _project_search_item()

    project_payload = {
        "id": 1158,
        "name": "Kvarter Älvan ",
        "published": True,
        "closed": False,
        "publish_date": "2025-06-25",
        "republish_date": None,
        "close_date": None,
        "status": "Published",
        "info_header": "Välkommen till kvarter Älvan",
        "area_info_header": None,
        "info_description": "Här hittar du kvarter Älvan, 298 hyreslägenheter med varierande storlekar.",
        "area_info_description": None,
        "apartment_count": 298,
        "preliminary_move_in_date": "2025-12-01",
        "is_short_lease": False,
        "show_timeline_module": False,
        "show_freetext_module": True,
        "show_area_info_module": True,
        "show_area_media_module": False,
        "show_email_collection_module": True,
        "range_information": {
            "rent": [7004, 20192],
            "rooms": ["1.0", "4.0"],
            "area": ["22.30", "113.30"],
            "floor": [0, 7],
            "has_discount": False,
        },
        "logo": "https://homeq-media-live.s3.eu-north-1.amazonaws.com/landlord_offices/logos/logo.jpg",
        "public_profile_slug": None,
        "candidate_sorting_mode": "first_come_first",
        "contract_system": "B",
        "office": {"id": 562, "name": "Sveaviken PM"},
        "landlord": {"id": 362, "name": "Sveaviken PM"},
        "freetext_entries": [
            {
                "title": "Kostnader",
                "description": "Utöver hyran tillkommer kostnad för kall- och varmvatten samt el.",
                "position": 0,
                "id": 1653,
            }
        ],
        "project_location": {
            "latitude": "59.4038659",
            "longitude": "17.8557312",
            "street": "",
            "street_number": "",
            "zip_code": "17534",
            "city": "Järfälla",
        },
        "timeline_entries": [],
        "unsubscribe_id": None,
        "campaign_id": None,
    }
    media_payload = {
        "three_d_views": [
            {
                "id": 236,
                "url": "https://my.matterport.com/show/?m=DimPA5ACJ7e",
                "position": 0,
                "title": "Exempel 4rok",
            }
        ],
        "project_images": [
            {
                "id": 6909,
                "image": "https://homeq-media-live.s3.amazonaws.com/project_images/306f.png",
                "position": 0,
                "caption": "Illustrationsbild.",
            },
            {
                "id": 7182,
                "image": "https://homeq-media-live.s3.amazonaws.com/project_images/4e7b.jpeg",
                "position": 1,
                "caption": "Exempelbild.",
            },
        ],
        "project_area_images": [],
        "project_videos": [],
        "project_area_videos": [],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == "https://api.homeq.se/api/v1/projects/1158":
            return httpx.Response(200, json=project_payload)
        if str(request.url) == "https://api.homeq.se/api/v1/projects/1158/media":
            return httpx.Response(200, json=media_payload)
        raise AssertionError(f"Unexpected request: {request.method} {request.url}")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        listing = await source.parse_listing(search_item, client)

    assert listing.id == "homeq:1158"
    assert listing.url == "https://www.homeq.se/projekt/1158"
    assert listing.name == "Kvarter Älvan"
    assert listing.loc_municipality == "Järfälla"
    assert listing.loc_district == "Järfälla"
    assert listing.rent == 7004
    assert listing.area_sqm == 22.3
    assert listing.num_rooms == 1
    assert listing.apartment_type == "regular"
    assert listing.num_apartments == 14
    assert listing.rent_range is not None
    assert listing.rent_range.min == 7004
    assert listing.rent_range.max == 20192
    assert listing.area_sqm_range is not None
    assert listing.area_sqm_range.min == 22.3
    assert listing.area_sqm_range.max == 113.3
    assert listing.floor_range is not None
    assert listing.floor_range.min == 0
    assert listing.floor_range.max == 7
    assert listing.floor == 7
    assert listing.coords is not None
    assert listing.coords.lat == 59.4038659
    assert listing.coords.long == 17.8557312
    assert listing.date_posted == datetime.fromisoformat("2025-06-25")
    assert listing.lease_start_date == "2025-12-01"
    assert listing.lease_end_date == "indefinite"
    assert listing.application_deadline_date is None
    assert listing.features.new_production is True
    assert listing.features.has_pictures is True
    assert listing.features.has_floorplan is False
    assert listing.allocation_info is not None
    assert listing.allocation_info.allocation_method == "application_date"
    assert listing.image_urls == [
        "https://homeq-media-live.s3.amazonaws.com/project_images/306f.png",
        "https://homeq-media-live.s3.amazonaws.com/project_images/4e7b.jpeg",
    ]
    assert listing.free_text is not None
    assert "Här hittar du kvarter Älvan" in listing.free_text
    assert "Kostnader" in listing.free_text


@pytest.mark.asyncio
async def test_homeq_fetch_json_paces_only_object_detail_requests(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = _homeq_source()
    current_time = 100.0
    sleep_calls: list[float] = []
    request_times: list[tuple[str, float]] = []

    async def fake_sleep(seconds: float) -> None:
        nonlocal current_time
        sleep_calls.append(seconds)
        current_time += seconds

    monkeypatch.setattr(source, "_sleep", fake_sleep)
    monkeypatch.setattr(source, "_monotonic", lambda: current_time)

    def handler(request: httpx.Request) -> httpx.Response:
        request_times.append((str(request.url), current_time))
        return httpx.Response(200, json={"ok": True})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await source._fetch_json(client, "https://api.homeq.se/api/v1/object/1")
        await source._fetch_json(client, "https://api.homeq.se/api/v1/object/2")
        await source._fetch_json(client, "https://api.homeq.se/api/v1/projects/1158")
        await source._fetch_json(client, "https://api.homeq.se/api/v1/projects/1158/media")

    assert request_times == [
        ("https://api.homeq.se/api/v1/object/1", 100.0),
        (
            "https://api.homeq.se/api/v1/object/2",
            pytest.approx(100.0 + OBJECT_DETAIL_REQUEST_INTERVAL_SECONDS),
        ),
        (
            "https://api.homeq.se/api/v1/projects/1158",
            pytest.approx(100.0 + OBJECT_DETAIL_REQUEST_INTERVAL_SECONDS),
        ),
        (
            "https://api.homeq.se/api/v1/projects/1158/media",
            pytest.approx(100.0 + OBJECT_DETAIL_REQUEST_INTERVAL_SECONDS),
        ),
    ]
    assert sleep_calls == [pytest.approx(OBJECT_DETAIL_REQUEST_INTERVAL_SECONDS)]


@pytest.mark.asyncio
async def test_homeq_fetch_json_retries_object_rate_limit_with_shared_cooldown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = _homeq_source()
    current_time = 50.0
    sleep_calls: list[float] = []
    request_times: list[float] = []
    request_count = 0

    async def fake_sleep(seconds: float) -> None:
        nonlocal current_time
        sleep_calls.append(seconds)
        current_time += seconds

    monkeypatch.setattr(source, "_sleep", fake_sleep)
    monkeypatch.setattr(source, "_monotonic", lambda: current_time)

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal request_count
        request_count += 1
        request_times.append(current_time)
        if request_count == 1:
            return httpx.Response(
                429,
                json={
                    "error": "RateLimited",
                    "description": "You are rate limited with 120/m.",
                },
            )
        return httpx.Response(200, json={"object_ad": {"id": 251059}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        payload = await source._fetch_json(client, "https://api.homeq.se/api/v1/object/251059")

    assert payload == {"object_ad": {"id": 251059}}
    assert request_times == [
        50.0,
        pytest.approx(50.0 + OBJECT_DETAIL_RATE_LIMIT_COOLDOWN_SECONDS),
    ]
    assert sleep_calls == [pytest.approx(OBJECT_DETAIL_RATE_LIMIT_COOLDOWN_SECONDS)]
