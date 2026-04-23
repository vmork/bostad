from app.models import ListingSources
from app.scraping.sources.bostadsthlm import _scrape_listing_json


def test_scrape_listing_json_adds_source_identity() -> None:
    listing = _scrape_listing_json({
        "AnnonsId": 123,
        "Gatuadress": "Testgatan 1",
        "Url": "/bostad/123",
        "Kommun": "Stockholm",
        "Stadsdel": "Sodermalm",
        "Hyra": 7000,
        "LägstaHyran": None,
        "Yta": 35,
        "LägstaYtan": None,
        "AntalRum": 1.5,
        "LägstaAntalRum": None,
        "KoordinatLatitud": None,
        "KoordinatLongitud": None,
        "Student": False,
        "Ungdom": False,
        "Senior": False,
        "Antal": None,
        "HögstaHyran": None,
        "HögstaYtan": None,
        "AnnonseradFran": None,
        "AnnonseradTill": None,
        "Vaning": 2,
        "HarBraChans": True,
        "Balkong": True,
        "Hiss": False,
        "Nyproduktion": False,
    })

    assert listing.id == "bostadsthlm:123"
    assert listing.source == ListingSources.BOSTAD_STHLM
    assert listing.source_local_id == "123"
