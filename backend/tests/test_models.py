from app.models import BostadSthlmSearchOptions, ListingSources, ListingsSearchOptions


def test_listings_search_options_dedupes_sources_and_normalizes_cookie() -> None:
    options = ListingsSearchOptions(
        sources=[ListingSources.BOSTAD_STHLM, ListingSources.BOSTAD_STHLM],
        bostadsthlm=BostadSthlmSearchOptions(
            cookie="Cookie: foo=bar;\n  baz=qux",
            max_listings=25,
        ),
    )

    assert options.sources == [ListingSources.BOSTAD_STHLM]
    assert options.bostadsthlm is not None
    assert options.bostadsthlm.cookie == "foo=bar; baz=qux"
    assert options.bostadsthlm.max_listings == 25
