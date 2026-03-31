from collections.abc import Awaitable, Callable
from typing import Any, Protocol

import httpx

from app.models import Listing, ListingSources, ListingsSearchOptions, ListingsStreamEvent

ProgressCallback = Callable[[ListingsStreamEvent], Awaitable[None]]


class ListingSource(Protocol):
    """Contract for source-specific listing implementations."""

    source_id: ListingSources

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
