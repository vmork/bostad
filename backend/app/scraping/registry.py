from app.models import ListingSources
from app.scraping.sources.bostadsthlm import BostadSthlmSource
from app.scraping.types import ListingSource

_SOURCES: dict[ListingSources, ListingSource] = {
    ListingSources.BOSTAD_STHLM: BostadSthlmSource(),
}


def get_listing_source(source_id: ListingSources) -> ListingSource:
    return _SOURCES[source_id]


def get_listing_sources(source_ids: list[ListingSources]) -> list[ListingSource]:
    return [get_listing_source(source_id) for source_id in source_ids]
