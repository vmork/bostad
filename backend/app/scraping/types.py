from collections.abc import Awaitable, Callable
from typing import Any, Optional as Opt, Protocol

import httpx

from app.models import Listing, ListingsStreamEvent, ListingsSearchOptions

ProgressCallback = Callable[[ListingsStreamEvent], Awaitable[None]]


class ListingSource(Protocol):
    """Contract for source-specific listing implementations."""

    source_id: str

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

    async def parse_listing(
        self,
        item: dict[str, Any],
        client: httpx.AsyncClient,
    ) -> Listing:
        """Parse a single listing item into the shared Listing model."""
        ...
