from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.main import app
from app.models import AllListingsResponse


def test_all_listings_get_returns_cached_response(monkeypatch) -> None:
    cached_response = AllListingsResponse(
        listings=[],
        errors=[],
        source_stats=[],
        updated_at=datetime(2026, 5, 11, 10, 0, tzinfo=UTC),
    )
    monkeypatch.setattr("app.main.read_cached_all_listings", lambda: cached_response)

    with TestClient(app) as client:
        response = client.get("/api/all_listings")

    assert response.status_code == 200
    assert response.json()["updatedAt"] == "2026-05-11T10:00:00Z"


def test_all_listings_get_returns_no_content_when_cache_missing(monkeypatch) -> None:
    monkeypatch.setattr("app.main.read_cached_all_listings", lambda: None)

    async def fail_if_scrape_called(*args, **kwargs):  # pragma: no cover
        raise AssertionError("GET /api/all_listings should not trigger a scrape")

    monkeypatch.setattr("app.main.scrape_listings_with_options", fail_if_scrape_called)

    with TestClient(app) as client:
        response = client.get("/api/all_listings")

    assert response.status_code == 204
    assert response.text == ""
