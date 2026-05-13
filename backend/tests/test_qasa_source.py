import asyncio
import json
from typing import Any

import httpx
import pytest

from app.models import ListingSources, ListingsSearchOptions, QasaSearchOptions
from app.scraping.scrape_utils import ListingParseException
from app.scraping.sources import qasa as qasa_module
from app.scraping.sources.qasa import DEFAULT_PAGE_SIZE, QasaSource


def _qasa_source() -> QasaSource:
    return QasaSource()


def _qasa_options(max_listings: int | None = None) -> ListingsSearchOptions:
    return ListingsSearchOptions(
        sources=[ListingSources.QASA],
        qasa=QasaSearchOptions(max_listings=max_listings),
    )


def _search_item(**overrides: Any) -> dict[str, Any]:
    item = {
        "id": "1341751",
        "firstHand": False,
        "furnished": True,
        "homeType": "apartment",
        "householdSize": 1,
        "description": "Fräsch lägenhet i bra skick i lugnt och fint villaområde.",
        "publishedAt": "2026-04-06T10:01:17Z",
        "rent": 8967,
        "roomCount": 1.0,
        "shared": False,
        "squareMeters": 30,
        "startDate": "2026-04-28T00:00:00+00:00",
        "endDate": None,
        "studentHome": False,
        "seniorHome": False,
        "tenantBaseFee": 533,
        "title": None,
        "location": {
            "locality": "Hässelby",
            "streetNumber": None,
            "route": "Edelundavägen",
            "point": {"lat": 59.3752629, "lon": 17.8246468},
        },
        "uploads": [
            {
                "type": "home_picture",
                "url": "https://qasa-static-prod.s3-eu-west-1.amazonaws.com/img/second.jpg",
                "order": 2,
            },
            {
                "type": "home_picture",
                "url": "https://qasa-static-prod.s3-eu-west-1.amazonaws.com/img/first.jpg",
                "order": 1,
            },
        ],
    }
    item.update(overrides)
    return item


def _detail_payload(**overrides: Any) -> dict[str, Any]:
    payload = {
        "id": "1341751",
        "floor": None,
        "location": {
            "locality": "Hässelby",
            "latitude": 59.3752629,
            "longitude": 17.8246468,
            "route": "Edelundavägen",
            "streetNumber": None,
        },
        "duration": {
            "startAsap": False,
            "startOptimal": "2026-04-28T00:00:00Z",
            "endUfn": True,
            "endOptimal": None,
        },
        "traits": [
            {"type": "furniture", "detail": "fully_furnished"},
            {"type": "dish_washer", "detail": None},
            {"type": "washing_machine", "detail": None},
            {"type": "shower", "detail": None},
            {"type": "toilet", "detail": None},
            {"type": "stove", "detail": None},
        ],
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_qasa_fetch_listing_index_paginates_and_dedupes() -> None:
    source = _qasa_source()
    requested_offsets: list[int] = []
    requested_limits: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert str(request.url) == "https://api.qasa.se/graphql"
        payload = json.loads(request.content.decode("utf-8"))
        variables = payload["variables"]
        requested_offsets.append(variables["offset"])
        requested_limits.append(variables["limit"])

        offset = variables["offset"]
        if offset == 0:
            body = {
                "data": {
                    "homeIndexSearch": {
                        "documents": {
                            "hasNextPage": True,
                            "totalCount": 3,
                            "nodes": [
                                _search_item(id="1", title="One"),
                                _search_item(id="2", title="Two"),
                            ],
                        }
                    }
                }
            }
        elif offset == 5:
            body = {
                "data": {
                    "homeIndexSearch": {
                        "documents": {
                            "hasNextPage": False,
                            "totalCount": 3,
                            "nodes": [
                                _search_item(id="2", title="Two"),
                                _search_item(id="3", title="Three"),
                            ],
                        }
                    }
                }
            }
        else:
            raise AssertionError(f"Unexpected offset {offset}")

        return httpx.Response(200, json=body)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        items = await source.fetch_listing_index(client, _qasa_options(max_listings=5))

    assert [item["id"] for item in items] == ["1", "2", "3"]
    assert requested_offsets == [0, 5]
    assert requested_limits == [5, 3]


@pytest.mark.asyncio
async def test_qasa_fetch_listing_index_uses_default_page_size() -> None:
    source = _qasa_source()
    requested_limit: int | None = None

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal requested_limit
        payload = json.loads(request.content.decode("utf-8"))
        requested_limit = payload["variables"]["limit"]
        return httpx.Response(
            200,
            json={
                "data": {
                    "homeIndexSearch": {
                        "documents": {
                            "hasNextPage": False,
                            "totalCount": 0,
                            "nodes": [],
                        }
                    }
                }
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await source.fetch_listing_index(client, _qasa_options())

    assert requested_limit == DEFAULT_PAGE_SIZE


@pytest.mark.asyncio
async def test_qasa_parse_listing_maps_regular_listing() -> None:
    source = _qasa_source()
    item = _search_item()

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content.decode("utf-8"))
        assert payload["operationName"] == "QasaHomeDetails"
        assert payload["variables"] == {"id0": "1341751"}
        assert "h0: home(id: $id0)" in payload["query"]
        return httpx.Response(200, json={"data": {"h0": _detail_payload()}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        listing = await source.parse_listing(item, client)

    assert listing.id == "qasa:1341751"
    assert listing.source == ListingSources.QASA
    assert listing.url == "https://qasa.com/se/en/home/1341751"
    assert listing.name == "Edelundavägen, Hässelby"
    assert listing.rent == 9500
    assert listing.area_sqm == 30
    assert listing.num_rooms == 1
    assert listing.apartment_type == "regular"
    assert listing.furnishing == "full"
    assert listing.tenure_type == "second_hand_private"
    assert listing.lease_start_date == "2026-04-28"
    assert listing.lease_end_date == "indefinite"
    assert listing.coords is not None
    assert listing.coords.lat == pytest.approx(59.3752629)
    assert listing.coords.long == pytest.approx(17.8246468)
    assert listing.date_posted is not None
    assert listing.requirements is not None
    assert listing.requirements.num_tenants_range is not None
    assert listing.requirements.num_tenants_range.max == 1
    assert listing.free_text == "Fräsch lägenhet i bra skick i lugnt och fint villaområde."
    assert listing.image_urls == [
        "https://qasa-static-prod.s3-eu-west-1.amazonaws.com/img/first.jpg",
        "https://qasa-static-prod.s3-eu-west-1.amazonaws.com/img/second.jpg",
    ]
    assert listing.features.dishwasher is True
    assert listing.features.washing_machine is True
    assert listing.features.kitchen is True
    assert listing.features.bathroom is True
    assert listing.features.has_pictures is True
    assert listing.features.has_viewing is None
    assert listing.features.num_pictures == 2


@pytest.mark.asyncio
async def test_qasa_parse_listing_batches_multiple_requests() -> None:
    source = _qasa_source()
    batch_queries: list[dict[str, Any]] = []
    first_item = _search_item(id="1341751")
    second_item = _search_item(
        id="1367963",
        title="Second home",
        location={
            "locality": "Solna",
            "streetNumber": None,
            "route": "Råsundavägen",
            "point": {"lat": 59.365, "lon": 18.0},
        },
        uploads=[],
    )

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content.decode("utf-8"))
        batch_queries.append(payload)
        assert payload["operationName"] == "QasaHomeDetails"
        assert set(payload["variables"].values()) == {"1341751", "1367963"}
        return httpx.Response(
            200,
            json={
                "data": {
                    "h0": _detail_payload(id=payload["variables"]["id0"]),
                    "h1": _detail_payload(
                        id=payload["variables"]["id1"],
                        location={
                            "locality": "Solna",
                            "latitude": 59.365,
                            "longitude": 18.0,
                            "route": "Råsundavägen",
                            "streetNumber": "8",
                        },
                    ),
                }
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        first_listing, second_listing = await asyncio.gather(
            source.parse_listing(first_item, client),
            source.parse_listing(second_item, client),
        )

    assert len(batch_queries) == 1
    assert first_listing.id == "qasa:1341751"
    assert second_listing.id == "qasa:1367963"
    assert second_listing.name == "Second home"


@pytest.mark.asyncio
async def test_qasa_parse_listing_maps_student_shared_partial_furnishing() -> None:
    source = _qasa_source()
    item = _search_item(
        id="1367963",
        furnished=True,
        shared=True,
        studentHome=True,
        seniorHome=False,
        householdSize=2,
        title="Student room",
        location={
            "locality": "Solna",
            "streetNumber": None,
            "route": "Råsundavägen",
            "point": {"lat": 59.365, "lon": 18.0},
        },
        uploads=[],
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "data": {
                    "h0": _detail_payload(
                        id="1367963",
                        floor=3,
                        location={
                            "locality": "Solna",
                            "latitude": 59.365,
                            "longitude": 18.0,
                            "route": "Råsundavägen",
                            "streetNumber": "12",
                        },
                        duration={
                            "startAsap": False,
                            "startOptimal": "2026-08-01T00:00:00Z",
                            "endUfn": False,
                            "endOptimal": "2027-05-31T00:00:00Z",
                        },
                        traits=[
                            {"type": "furniture", "detail": "partly_furnished"},
                            {"type": "elevator", "detail": None},
                        ],
                    )
                }
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        listing = await source.parse_listing(item, client)

    assert listing.id == "qasa:1367963"
    assert listing.name == "Student room"
    assert listing.apartment_type == "student"
    assert listing.tenure_type == "second_hand_shared"
    assert listing.furnishing == "partial"
    assert listing.floor == 3
    assert listing.lease_start_date == "2026-08-01"
    assert listing.lease_end_date == "2027-05-31"
    assert listing.requirements is not None
    assert listing.requirements.student is True
    assert listing.requirements.num_tenants_range is not None
    assert listing.requirements.num_tenants_range.max == 2
    assert listing.features.elevator is True
    assert listing.features.has_pictures is False
    assert listing.image_urls is None


@pytest.mark.asyncio
async def test_qasa_parse_listing_retries_rate_limited_batch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = _qasa_source()
    item = _search_item()
    attempts = 0
    monkeypatch.setattr(qasa_module, "DETAIL_BATCH_RETRY_BASE_SECONDS", 0.0)

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(429, text="Retry later\n")
        return httpx.Response(200, json={"data": {"h0": _detail_payload()}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        listing = await source.parse_listing(item, client)

    assert listing.id == "qasa:1341751"
    assert attempts == 2


@pytest.mark.asyncio
async def test_qasa_parse_listing_raises_for_graphql_errors() -> None:
    source = _qasa_source()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"errors": [{"message": "Listing not found"}]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ListingParseException, match="Listing not found"):
            await source.parse_listing(_search_item(), client)
