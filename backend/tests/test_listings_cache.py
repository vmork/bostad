from datetime import datetime

from app.listings_cache import read_cached_all_listings


def test_read_cached_all_listings_overrides_updated_at_from_sidecar(
    monkeypatch,
    tmp_path,
) -> None:
    monkeypatch.setenv("BOSTAD_CACHE_DIR", str(tmp_path))
    (tmp_path / "all_listings.json").write_text(
        '{"listings": [], "errors": [], "sourceStats": [], "updatedAt": "2026-05-01T10:00:00+00:00"}'
    )
    (tmp_path / "all_listings.updated_at").write_text("2026-05-10T04:15:00+00:00")

    cached_response = read_cached_all_listings()

    assert cached_response is not None
    assert cached_response.updated_at == datetime.fromisoformat("2026-05-10T04:15:00+00:00")


def test_read_cached_all_listings_uses_payload_when_sidecar_missing(
    monkeypatch,
    tmp_path,
) -> None:
    monkeypatch.setenv("BOSTAD_CACHE_DIR", str(tmp_path))
    (tmp_path / "all_listings.json").write_text(
        '{"listings": [], "errors": [], "sourceStats": [], "updatedAt": "2026-05-01T10:00:00+00:00"}'
    )

    cached_response = read_cached_all_listings()

    assert cached_response is not None
    assert cached_response.updated_at == datetime.fromisoformat("2026-05-01T10:00:00+00:00")