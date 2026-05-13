from typing import Any

import httpx
import pytest

from app.geo import GeoResolvedLocation
from app.models import (
    Coordinates,
    Listing,
    ListingFeatures,
    ListingSources,
    ListingSourceStats,
    ListingsSearchOptions,
)
from app.scraping.core import ListingSource, scrape_listings_with_options
from app.scraping.scrape_utils import build_source_scoped_id


class FakeSource(ListingSource):
    source_id = ListingSources.BOSTAD_STHLM
    name = "Bostadsförmedlingen"
    global_url = "https://bostad.stockholm.se"
    detail_fetch_concurrency = 2

    def configure_client(self, client: httpx.AsyncClient, options: ListingsSearchOptions) -> None:
        return None

    def infer_logged_in(self, items: list[dict[str, Any]]) -> bool | None:
        return False

    def limit_index_items(
        self,
        items: list[dict[str, Any]],
        options: ListingsSearchOptions,
    ) -> list[dict[str, Any]]:
        return items

    def build_source_stats(
        self,
        *,
        logged_in: bool | None,
        num_listings: int,
        num_errors: int,
    ) -> ListingSourceStats:
        return ListingSourceStats(
            source=self.source_id,
            name=self.name,
            global_url=self.global_url,
            logged_in=logged_in,
            num_listings=num_listings,
            num_errors=num_errors,
        )

    async def fetch_listing_index(
        self,
        client: httpx.AsyncClient,
        options: ListingsSearchOptions,
    ) -> list[dict[str, Any]]:
        return [{"id": "abc"}]

    def get_listing_id(self, item: dict[str, Any]) -> str:
        return str(item["id"])

    def get_listing_url(self, item: dict[str, Any]) -> str | None:
        return f"{self.global_url}/bostad/{item['id']}"

    async def parse_listing(
        self,
        item: dict[str, Any],
        client: httpx.AsyncClient,
    ) -> Listing:
        source_local_id = self.get_listing_id(item)
        return Listing(
            id=build_source_scoped_id(self.source_id, source_local_id),
            source=self.source_id,
            source_local_id=source_local_id,
            url=self.get_listing_url(item) or self.global_url,
            name="Example listing",
            loc_municipality="Stockholm",
            loc_district="Sodermalm",
            rent=5000,
            area_sqm=30,
            num_rooms=1,
            apartment_type="regular",
            features=ListingFeatures(),
            floor=1,
        )


class FailingFakeSource(FakeSource):
    async def fetch_listing_index(
        self,
        client: httpx.AsyncClient,
        options: ListingsSearchOptions,
    ) -> list[dict[str, Any]]:
        raise RuntimeError("boom")


class GeoFakeSource(FakeSource):
    async def parse_listing(
        self,
        item: dict[str, Any],
        client: httpx.AsyncClient,
    ) -> Listing:
        listing = await super().parse_listing(item, client)
        listing.coords = Coordinates(lat=59.334, long=18.063)
        return listing


@pytest.mark.asyncio
async def test_scrape_listings_with_options_emits_final_complete_event(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.scraping.core.lookup_location",
        lambda lat, long: GeoResolvedLocation(
            district_id=321,
            district_name="Södermalm",
            municipality_id="0180",
            municipality_name="Stockholm",
        ),
    )
    events = []

    async def progress_callback(event):
        events.append(event)

    result = await scrape_listings_with_options(
        [GeoFakeSource()],
        ListingsSearchOptions(),
        progress_callback=progress_callback,
    )

    assert len(result.listings) == 1
    assert result.errors == []
    assert result.source_stats[0].num_listings == 1
    assert all(event.event != "complete" for event in events[:-1])
    assert events[-1].event == "complete"
    assert events[-1].data is not None
    assert events[-1].data.listings[0].id == "bostadsthlm:abc"


@pytest.mark.asyncio
async def test_scrape_listings_with_options_wraps_source_failures() -> None:
    result = await scrape_listings_with_options([FailingFakeSource()], ListingsSearchOptions())

    assert result.listings == []
    assert len(result.errors) == 1
    assert result.errors[0].id == "bostadsthlm:source-error"
    assert result.source_stats[0].num_errors == 1


@pytest.mark.asyncio
async def test_scrape_listings_with_options_normalizes_location_from_geo_lookup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.scraping.core.lookup_location",
        lambda lat, long: GeoResolvedLocation(
            district_id=321,
            district_name="Södermalm",
            municipality_id="0180",
            municipality_name="Stockholm",
        ),
    )

    result = await scrape_listings_with_options([GeoFakeSource()], ListingsSearchOptions())

    assert len(result.listings) == 1
    listing = result.listings[0]
    assert listing.district_id == 321
    assert listing.loc_municipality == "Stockholm"
    assert listing.loc_district == "Södermalm"


@pytest.mark.asyncio
async def test_scrape_listings_with_options_keeps_source_location_when_geo_lookup_misses(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.scraping.core.lookup_location", lambda lat, long: None)

    result = await scrape_listings_with_options([GeoFakeSource()], ListingsSearchOptions())

    assert result.listings == []
    assert result.errors == []
    assert result.source_stats[0].num_listings == 0


@pytest.mark.asyncio
async def test_scrape_listings_with_options_skips_listings_without_coords() -> None:
    result = await scrape_listings_with_options([FakeSource()], ListingsSearchOptions())

    assert result.listings == []
    assert result.errors == []
    assert result.source_stats[0].num_listings == 0