from app.models import (
    BostadSthlmSearchOptions,
    ListingSources,
    ListingsSearchOptions,
    QasaSearchOptions,
)


def test_listings_search_options_dedupes_sources_and_normalizes_cookie() -> None:
    options = ListingsSearchOptions(
        sources=[ListingSources.BOSTAD_STHLM, ListingSources.BOSTAD_STHLM, ListingSources.QASA],
        bostadsthlm=BostadSthlmSearchOptions(
            cookie="Cookie: foo=bar;\n  baz=qux",
            max_listings=25,
        ),
        qasa=QasaSearchOptions(max_listings=50),
    )

    assert options.sources == [ListingSources.BOSTAD_STHLM, ListingSources.QASA]
    assert options.bostadsthlm is not None
    assert options.bostadsthlm.cookie == "foo=bar; baz=qux"
    assert options.bostadsthlm.max_listings == 25
    assert options.qasa is not None
    assert options.qasa.max_listings == 50


def test_listings_search_options_default_sources_include_qasa() -> None:
    options = ListingsSearchOptions()

    assert options.sources == [
        ListingSources.BOSTAD_STHLM,
        ListingSources.HOMEQ,
        ListingSources.QASA,
    ]
