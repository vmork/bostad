import httpx


def create_async_client() -> httpx.AsyncClient:
    """Create the shared async HTTP client used by scraping orchestration."""
    return httpx.AsyncClient(follow_redirects=True)
