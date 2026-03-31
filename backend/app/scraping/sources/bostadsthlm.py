import logging
import time
from typing import Any

import httpx

from app.models import Listing, ListingSources, ListingsSearchOptions
from app.scrape_bostadsthlm import (
    BOSTAD_STHLM_BASE_PATH,
    LISTINGS_TIMEOUT,
    ListingsFetchException,
    parse_listing_async,
)
from app.scraping.core import ListingSource

logger = logging.getLogger(__name__)


class BostadSthlmSource(ListingSource):
    """Source implementation for bostad.stockholm.se listings."""

    source_id: ListingSources = ListingSources.BOSTAD_STHLM

    async def fetch_listing_index(
        self,
        client: httpx.AsyncClient,
        options: ListingsSearchOptions,
    ) -> list[dict[str, Any]]:
        # Keep this explicit to guarantee option/source alignment while only
        # one source is supported.
        if options.sources[0] != self.source_id:
            raise ValueError(f"Unsupported source: {options.sources[0]}")

        listings_url = f"{BOSTAD_STHLM_BASE_PATH}/AllaAnnonser/"
        logger.info(f"[{self.source_id}] Fetching listings index from {listings_url}")
        started_at = time.time()
        try:
            response = await client.get(
                listings_url,
                timeout=LISTINGS_TIMEOUT,
            )
            response.raise_for_status()
        except httpx.HTTPError as error:
            logger.error(
                f"[{self.source_id}] Failed to fetch listings index from {listings_url}: {error}"
            )
            raise ListingsFetchException(f"Failed to fetch {listings_url}: {error}") from error

        logger.info(
            f"[{self.source_id}] Fetched listings index in "
            f"{time.time() - started_at:.2f} seconds, parsing JSON payload"
        )
        return response.json()

    def get_listing_id(self, item: dict[str, Any]) -> str:
        return str(item.get("AnnonsId", "unknown"))
    
    def get_listing_url(self, item: dict[str, Any]) -> str | None:
        return f"{BOSTAD_STHLM_BASE_PATH}/bostad/{item.get('AnnonsId')}" if item.get("AnnonsId") else None

    async def parse_listing(
        self,
        item: dict[str, Any],
        client: httpx.AsyncClient,
    ) -> Listing:
        return await parse_listing_async(item, client, include_html=True)
