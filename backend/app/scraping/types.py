from collections.abc import Awaitable, Callable
from typing import Any, Protocol

import httpx

from app.models import (
    Listing,
    ListingSources,
    ListingSourceStats,
    ListingsSearchOptions,
    ListingsStreamEvent,
)

ProgressCallback = Callable[[ListingsStreamEvent], Awaitable[None]]


class ListingSource(Protocol):
    """Contract for source-specific listing implementations."""

    source_id: ListingSources
    name: str
    global_url: str
    detail_fetch_concurrency: int

    def configure_client(
        self,
        client: httpx.AsyncClient,
        options: ListingsSearchOptions,
    ) -> None:
        """Apply source-specific request headers, auth, and client settings."""
        ...

    def infer_logged_in(self, items: list[dict[str, Any]]) -> bool | None:
        """Infer login state from fetched source index items, if available."""
        ...

    def limit_index_items(
        self,
        items: list[dict[str, Any]],
        options: ListingsSearchOptions,
    ) -> list[dict[str, Any]]:
        """Apply source-specific limiting or filtering to the fetched index items."""
        ...

    def build_source_stats(
        self,
        *,
        logged_in: bool | None,
        num_listings: int,
        num_errors: int,
    ) -> ListingSourceStats:
        """Build the frontend-facing stats payload for this source."""
        ...

    async def fetch_listing_index(
        self,
        client: httpx.AsyncClient,
        options: ListingsSearchOptions,
    ) -> list[dict[str, Any]]:
        """Fetch and return source-specific index items used to parse listings."""
        ...

    def get_listing_id(self, item: dict[str, Any]) -> str:
        """Return the stable listing identifier for progress and errors."""
        ...

    def get_listing_url(self, item: dict[str, Any]) -> str | None:
        """Return the listing URL for error reporting, if available."""
        ...

    async def parse_listing(
        self,
        item: dict[str, Any],
        client: httpx.AsyncClient,
    ) -> Listing:
        """Parse a single listing item into the shared Listing model."""
        ...
