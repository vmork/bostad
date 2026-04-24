import asyncio
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

from app.models import ListingSources
from app.scraping.sources import bostadsthlm
from app.scraping.sources.bostadsthlm import (
    _extract_requirements,
    _scrape_listing_html,
    _scrape_listing_json,
)

FIXTURE_DIR = Path(__file__).with_name("data") / "bostadsthlm"

# Fixture helpers

def _read_fixture(name: str) -> str:
    return (FIXTURE_DIR / name).read_text()

def _build_listing_json(annons_id: int, **overrides: object) -> dict[str, object]:
    listing_json: dict[str, object] = {
        "AnnonsId": annons_id,
        "Gatuadress": f"Testgatan {annons_id}",
        "Url": f"/bostad/{annons_id}/",
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
    }
    listing_json.update(overrides)
    return listing_json

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

def test_extract_requirements_supports_logged_in_accordion_markup() -> None:
    soup = BeautifulSoup(
        """
        <div class="villkor-content">
            <div>
                <h3>Villkor för att anmäla intresse</h3>
                <div class="js-accordion">
                    <span class="js-accordion__header">Lägsta tillåtna ålder: 18 år</span>
                    <span class="js-accordion__header">Högsta tillåtna ålder: 25 år</span>
                    <span class="js-accordion__header">Max antal hushållsmedlemmar: 2</span>
                </div>
            </div>
        </div>
        """,
        "html.parser",
    )

    requirements = _extract_requirements(soup)

    assert requirements is not None
    assert requirements.age_range is not None
    assert requirements.age_range.min == 18
    assert requirements.age_range.max == 25
    assert requirements.num_tenants_range is not None
    assert requirements.num_tenants_range.max == 2

def test_extract_requirements_prefers_housing_type_section_for_age_fallback() -> None:
    soup = BeautifulSoup(
        """
        <div class="main-body__content">
            <h3>Förmedlingsinformation</h3>
            <p>Kötiden i den här gruppen ligger mellan 3 och 4 år.</p>
            <h3>Typ av bostad</h3>
            <p>Det här är en ungdomsbostad. Den kan sökas av dig som är mellan 18 och 25 år.</p>
        </div>
        """,
        "html.parser",
    )

    requirements = _extract_requirements(soup)

    assert requirements is not None
    assert requirements.age_range is not None
    assert requirements.age_range.min == 18
    assert requirements.age_range.max == 25

# Real fixture coverage

def test_scrape_listing_html_extracts_regular_listing_details_from_fixture() -> None:
    parsed = _scrape_listing_html(_read_fixture("regular_202608056_loggedout.html"))

    assert parsed.image_urls is not None
    assert len(parsed.image_urls) == 4
    assert parsed.floorplan_url == "https://bostad.stockholm.se/uploads/2175211ritning.jpg"
    assert parsed.floor_range is not None
    assert parsed.floor_range.min == 3
    assert parsed.floor_range.max == 3
    assert parsed.features is not None
    assert parsed.features.kitchen is True
    assert parsed.features.bathroom is True
    assert parsed.features.dishwasher is True
    assert parsed.features.washing_machine is True
    assert parsed.features.has_viewing is False
    assert parsed.requirements is not None
    assert parsed.requirements.income_range is not None
    assert parsed.requirements.income_range.min == 405000
    assert parsed.free_text is not None
    assert "Fastigheten är byggd 1972." in parsed.free_text


def test_scrape_listing_html_extracts_student_listing_requirements_from_fixture() -> None:
    parsed = _scrape_listing_html(_read_fixture("student_202604426_loggedout.html"))

    assert parsed.image_urls is not None
    assert len(parsed.image_urls) == 8
    assert parsed.floorplan_url == "https://bostad.stockholm.se/uploads/2080386ritning.pdf"
    assert parsed.requirements is not None
    assert parsed.requirements.student is True
    assert parsed.requirements.num_tenants_range is not None
    assert parsed.requirements.num_tenants_range.max == 1
    assert parsed.features is not None
    assert parsed.features.kitchen is True
    assert parsed.features.bathroom is True
    assert parsed.features.has_viewing is False
    assert parsed.free_text is not None
    assert "Det här är en studentbostad." in parsed.free_text


def test_scrape_listing_html_extracts_multiunit_listing_details_from_fixture() -> None:
    parsed = _scrape_listing_html(_read_fixture("multiunit_202608114_loggedout.html"))

    assert parsed.image_urls is not None
    assert len(parsed.image_urls) == 12
    assert parsed.floorplan_url == "https://bostad.stockholm.se/uploads/1910894ritning.pdf"
    assert parsed.floor_range is not None
    assert parsed.floor_range.min == 3
    assert parsed.floor_range.max == 5
    assert parsed.features is not None
    assert parsed.features.bathroom is True
    assert parsed.features.has_viewing is True
    assert parsed.requirements is not None
    assert parsed.requirements.num_tenants_range is not None
    assert parsed.requirements.num_tenants_range.max == 6
    assert parsed.free_text is not None
    assert "Här annonseras bostäder om 4 rum och kök." in parsed.free_text


# Logged-in versus logged-out compatibility


def test_scrape_listing_html_keeps_youth_requirements_consistent_across_auth_states() -> None:
    logged_out = _scrape_listing_html(_read_fixture("youth_202607957_loggedout.html"))
    logged_in = _scrape_listing_html(_read_fixture("youth_202607957_loggedin.html"))

    assert logged_out.requirements is not None
    assert logged_in.requirements is not None
    assert logged_out.requirements.model_dump() == logged_in.requirements.model_dump()
    assert logged_out.floorplan_url == logged_in.floorplan_url
    assert logged_out.floor_range is not None
    assert logged_in.floor_range is not None
    assert logged_out.floor_range.model_dump() == logged_in.floor_range.model_dump()


def test_scrape_listing_html_only_exposes_my_queue_position_for_logged_in_fixture() -> None:
    logged_out = _scrape_listing_html(_read_fixture("youth_202607957_loggedout.html"))
    logged_in = _scrape_listing_html(_read_fixture("youth_202607957_loggedin.html"))

    assert logged_out.queue_position is not None
    assert logged_in.queue_position is not None
    assert (
        logged_out.queue_position.oldest_queue_dates == logged_in.queue_position.oldest_queue_dates
    )
    assert logged_out.queue_position.my_position is None
    assert logged_out.queue_position.total is None
    assert logged_in.queue_position.my_position == 68
    assert logged_in.queue_position.total == 118


# Merge behavior


def test_parse_listing_async_promotes_student_listing_from_fixture(monkeypatch) -> None:
    fixture_html = _read_fixture("student_202604426_loggedout.html")

    async def fake_fetch_listing_html(_client: httpx.AsyncClient, _url: str) -> str:
        return fixture_html

    monkeypatch.setattr(bostadsthlm, "_fetch_listing_html", fake_fetch_listing_html)

    async def run_test() -> None:
        async with httpx.AsyncClient() as client:
            listing = await bostadsthlm.parse_listing_async(
                _build_listing_json(
                    202604426,
                    Gatuadress="Björnkullaringen 26",
                    Url="/bostad/202604426/",
                    Kommun="Huddinge",
                    Stadsdel="Flemingsberg",
                    Hyra=4370,
                    Yta=23,
                    AntalRum=1,
                    Vaning=None,
                    HarBraChans=None,
                    Balkong=None,
                    Hiss=None,
                    Student=False,
                ),
                client,
                include_html=True,
            )

        assert listing.apartment_type == "student"
        assert listing.requirements is not None
        assert listing.requirements.student is True
        assert listing.features.has_pictures is True
        assert listing.features.has_floorplan is True
        assert listing.image_urls is not None
        assert len(listing.image_urls) == 8
        assert listing.floorplan_url == "https://bostad.stockholm.se/uploads/2080386ritning.pdf"

    asyncio.run(run_test())


def test_parse_listing_async_merges_multiunit_html_details_into_listing(monkeypatch) -> None:
    fixture_html = _read_fixture("multiunit_202608114_loggedout.html")

    async def fake_fetch_listing_html(_client: httpx.AsyncClient, _url: str) -> str:
        return fixture_html

    monkeypatch.setattr(bostadsthlm, "_fetch_listing_html", fake_fetch_listing_html)

    async def run_test() -> None:
        async with httpx.AsyncClient() as client:
            listing = await bostadsthlm.parse_listing_async(
                _build_listing_json(
                    202608114,
                    Gatuadress="Hälsovägen 16B",
                    Url="/bostad/202608114/",
                    Kommun="Huddinge",
                    Stadsdel="Flemingsberg",
                    Hyra=19616,
                    LägstaHyran=18900,
                    Yta=88,
                    LägstaYtan=83,
                    AntalRum=4,
                    LägstaAntalRum=4,
                    Antal=4,
                    HögstaHyran=19616,
                    HögstaYtan=88,
                    Vaning=None,
                    HarBraChans=None,
                    Balkong=None,
                    Hiss=True,
                    Nyproduktion=True,
                ),
                client,
                include_html=True,
            )

        assert listing.floor == 5
        assert listing.floor_range is not None
        assert listing.floor_range.min == 3
        assert listing.floor_range.max == 5
        assert listing.features.elevator is True
        assert listing.features.new_production is True
        assert listing.features.has_viewing is True
        assert listing.features.has_pictures is True
        assert listing.features.has_floorplan is True
        assert listing.requirements is not None
        assert listing.requirements.num_tenants_range is not None
        assert listing.requirements.num_tenants_range.max == 6
        assert listing.image_urls is not None
        assert len(listing.image_urls) == 12

    asyncio.run(run_test())
