from app.models import ListingSources
from app.scraping.sources.bostadsthlm import BostadSthlmSource
from app.scraping.sources.homeq import HomeQSource
from app.scraping.sources.qasa import QasaSource
from app.scraping.types import ListingSource

_SOURCES: dict[ListingSources, ListingSource] = {
    ListingSources.BOSTAD_STHLM: BostadSthlmSource(),
    ListingSources.HOMEQ: HomeQSource(),
    ListingSources.QASA: QasaSource(),
}


def get_listing_source(source_id: ListingSources) -> ListingSource:
    return _SOURCES[source_id]


def get_listing_sources(source_ids: list[ListingSources]) -> list[ListingSource]:
    return [get_listing_source(source_id) for source_id in source_ids]
