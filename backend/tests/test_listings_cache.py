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


def test_read_cached_all_listings_accepts_legacy_payload_missing_floor(
    monkeypatch,
    tmp_path,
) -> None:
    monkeypatch.setenv("BOSTAD_CACHE_DIR", str(tmp_path))
    (tmp_path / "all_listings.json").write_text(
        """
                {
                    "listings": [
                        {
                            "id": "bostadsthlm:test-1",
                            "source": "bostadsthlm",
                            "sourceLocalId": "test-1",
                            "url": "https://example.com/listing/1",
                            "name": "Testgatan 1",
                            "locMunicipality": "Stockholm",
                            "locDistrict": "Sodermalm",
                            "rent": 12345,
                            "areaSqm": 45,
                            "numRooms": 2,
                            "apartmentType": "regular",
                            "features": {
                                "dishwasher": false,
                                "washingMachine": false,
                                "dryer": false
                            }
                        }
                    ],
                    "errors": [],
                    "sourceStats": [],
                    "updatedAt": "2026-05-01T10:00:00+00:00"
                }
                """
    )

    cached_response = read_cached_all_listings()

    assert cached_response is not None
    assert len(cached_response.listings) == 1
    assert cached_response.listings[0].floor is None
