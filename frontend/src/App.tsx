import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useState } from "react";
import { MapIcon } from "lucide-react";

import { FilterDropdown } from "./components/FilterDropdown";
import { RefetchButton } from "./components/RefetchButton";
import { SortDropdown } from "./components/SortDropdown";
import { VirtualizedListingsList } from "./components/VirtualizedListingsList";

import { type Listing, type ListingParseError, type ListingSourceStats } from "./api/models";
import { useListingsData } from "./hooks/useListingsData";
import { useLocalStorage } from "./hooks/useLocalStorage";
import {
  applyFiltersToList,
  deriveContextualFilterStats,
  sortList,
  type Filter,
} from "./lib/filterSort";
import {
  buildSortEntries,
  hydrateFilters,
  hydrateSortEntries,
  serializeFilters,
  serializeSortEntries,
  syncFiltersWithData,
  type SerializedFilterState,
  type SerializedSortEntry,
} from "./lib/keyConfig";
import { mergeSourceMetadata } from "./lib/sourceMetadata";
import { cn, formatUpdatedAt } from "./lib/utils";
import { Button } from "./components/generic/Button";

const LISTINGS_FILTERS_STORAGE_KEY = "listingsFilters";
const LISTINGS_SORT_STORAGE_KEY = "listingsSort";

const MapFilterModal = lazy(async () => {
  const module = await import("./components/MapFilterModal");
  return { default: module.MapFilterModal };
});

function mergeFilterStats(filters: Filter<Listing>[], filtersWithStats: Filter<Listing>[]) {
  const filtersById = new Map(filtersWithStats.map((filter) => [filter.id, filter] as const));

  return filters.map((filter) => {
    const nextFilter = filtersById.get(filter.id);
    if (!nextFilter || nextFilter.type !== filter.type) return filter;

    switch (filter.type) {
      case "range":
        return { ...filter, stats: nextFilter.stats };
      case "set":
        return { ...filter, stats: nextFilter.stats };
      case "boolean":
        return { ...filter, stats: nextFilter.stats };
    }
  });
}

function SourceStatsPanel({ sourceStats }: { sourceStats: ListingSourceStats[] }) {
  if (sourceStats.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {sourceStats.map((stat) => (
        <a
          key={stat.source}
          href={stat.globalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-gs-3/50 bg-gs-1 p-1.5 text-xs text-dark"
        >
          <span className="text-xs font-medium">{stat.name}:</span>
          <span className="ml-2 text-gs-3">{stat.numListings ?? 0} listings</span>
          {(stat.numErrors ?? 0) > 0 && (
            <span className="ml-1 text-gs-3">· {stat.numErrors} errors</span>
          )}
          {stat.loggedIn && <span className="ml-1 text-gs-3">· Logged in</span>}
        </a>
      ))}
    </div>
  );
}

function ParseErrorsPanel({
  errors,
  sourceNameById,
}: {
  errors: ListingParseError[];
  sourceNameById: Record<string, { name: string; globalUrl: string }>;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-red-300 bg-red-50">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left cursor-pointer"
      >
        <span className="text-sm font-medium text-red-900">Parsing errors: {errors.length}</span>
        <span className="text-sm text-red-700">{expanded ? "Collapse" : "Expand"}</span>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-red-200 px-4 py-3">
          {errors.map((error) => (
            <div
              key={error.id}
              className="rounded-md border border-red-200 bg-white/60 px-3 py-2 text-sm text-red-900 overflow-auto"
            >
              <div className="mb-1 font-medium">
                {sourceNameById[error.source]?.name ?? error.source}
              </div>
              <span className="font-bold">{error.url ? `url: ${error.url}` : "url: N/A"}</span>
              <pre>{error.reason}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const listingsQuery = useListingsData();

  const { listings, errors } = listingsQuery.data;
  const [storedFilterStates, setStoredFilterStates] = useLocalStorage<SerializedFilterState[]>(
    LISTINGS_FILTERS_STORAGE_KEY,
    [],
  );
  const [storedSortStates, setStoredSortStates] = useLocalStorage<SerializedSortEntry[]>(
    LISTINGS_SORT_STORAGE_KEY,
    [],
  );

  const numApartments = listings
    .map((listing) => listing.numApartments ?? 1)
    .reduce((total, count) => total + count, 0);
  const apartmentsLabel = `(${numApartments} apts.)`;

  const _defaultSortEntries = useMemo(() => buildSortEntries(), []);
  const [filters, setFilters] = useState(() => hydrateFilters(storedFilterStates, listings));
  const [sortEntries, setSortEntries] = useState(() => hydrateSortEntries(storedSortStates));
  const [mapOpen, setMapOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const deferredFilters = useDeferredValue(filters);
  const deferredSortEntries = useDeferredValue(sortEntries);

  // Check if the location filter is active (has selected districts)
  const locationFilterActive = filters.some((f) => f.id === "districtId" && f.state.enabled);

  useEffect(() => {
    setFilters((currentFilters) => syncFiltersWithData(currentFilters, listings));
  }, [listings]);

  useEffect(() => {
    setStoredFilterStates(serializeFilters(filters));
  }, [filters, setStoredFilterStates]);

  useEffect(() => {
    setStoredSortStates(serializeSortEntries(sortEntries));
  }, [sortEntries, setStoredSortStates]);

  const contextualFilters = useMemo(() => {
    if (!filtersOpen) return null;
    return deriveContextualFilterStats(deferredFilters, listings);
  }, [deferredFilters, filtersOpen, listings]);

  const displayFilters = useMemo(() => {
    if (!contextualFilters) return filters;
    return mergeFilterStats(filters, contextualFilters);
  }, [contextualFilters, filters]);

  const displayedListings = useMemo(() => {
    const filtered = applyFiltersToList(listings, deferredFilters);
    return sortList(filtered, deferredSortEntries);
  }, [deferredFilters, deferredSortEntries, listings]);

  const displayedListingsAreStale = deferredFilters !== filters || deferredSortEntries !== sortEntries;
  const sourceNameById = useMemo(
    () => mergeSourceMetadata(listingsQuery.sourceStats),
    [listingsQuery.sourceStats],
  );

  // if (displayedListings) {
  //   console.log(displayedListings);
  // }

  return (
    <div className="min-h-screen bg-background px-3 py-4 md:px-8 md:py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Before listings */}
        <div className="mb-0">
          {/* Header */}
          <h1
            className={cn(
              "text-2xl font-semibold text-dark grow leading-tight",
              displayedListingsAreStale && "opacity-50",
            )}
          >
            {listingsQuery.hasCachedData ? (
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span>{`Showing ${displayedListings.length}/${listings.length} listings`}</span>
                <span className="basis-full text-sm font-medium text-gs-3 md:basis-auto md:text-2xl md:font-semibold md:text-dark">
                  {apartmentsLabel}
                </span>
              </span>
            ) : (
              "No listings yet"
            )}
          </h1>

          {/* Row 1: Refetch button and update info */}
          <div className="mt-2 flex flex-col items-start gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
            <div className="">
              <RefetchButton
                hasCachedData={listingsQuery.hasCachedData}
                isFetching={listingsQuery.isFetching}
                progress={listingsQuery.progress}
                onFetch={listingsQuery.startListingsStream}
              />
            </div>
            {listingsQuery.updatedAt && (
              <p className="text-sm text-gs-3 md:mt-1">
                Updated {formatUpdatedAt(listingsQuery.updatedAt)}
                {(listingsQuery.refreshDelta.added > 0 ||
                  listingsQuery.refreshDelta.removed > 0) && (
                  <span className="text-primary ml-2 font-medium">
                    {listingsQuery.refreshDelta.added > 0 && (
                      <> · Added {listingsQuery.refreshDelta.added}</>
                    )}
                    {listingsQuery.refreshDelta.removed > 0 && (
                      <> · Removed {listingsQuery.refreshDelta.removed}</>
                    )}
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Blocking fetch error */}
          {listingsQuery.fetchError && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-4 mt-2">
              <h2 className="mb-2 text-lg font-semibold text-red-900">Could not fetch listings</h2>
              <p className="text-sm text-red-700">{listingsQuery.fetchError}</p>
            </div>
          )}

          {/* Row 2: Source stats */}
          <div className="mt-2">
            <div className="font-medium pb-0.5">Sources</div>
            <div className="">
              <SourceStatsPanel sourceStats={listingsQuery.sourceStats} />
            </div>
          </div>

          {/* Row 3: List of non-blocking parse errors */}
          {errors.length > 0 && (
            <div className="mt-2">
              <ParseErrorsPanel errors={errors} sourceNameById={sourceNameById} />
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-gs-2 my-5" />

        {/* Controls + list */}
        <div className="space-y-2">
          {/* Filtering and sorting controls */}
          <div className="flex flex-wrap gap-2 md:gap-3">
            {listingsQuery.hasCachedData && (
              <>
                <FilterDropdown
                  filters={filters}
                  displayFilters={displayFilters}
                  setFilters={setFilters}
                  onOpenChange={setFiltersOpen}
                />
                <Button
                  size="large"
                  className={cn(
                    locationFilterActive && "border-primary/60 bg-primary/10 text-primary",
                  )}
                  onClick={() => setMapOpen(true)}
                >
                  <MapIcon className="w-4 h-4 mr-1" />
                  Map
                </Button>
                <SortDropdown
                  sortEntries={sortEntries}
                  setSortEntries={setSortEntries}
                  defaultSortEntries={_defaultSortEntries}
                />
              </>
            )}
          </div>

          {/* Listings list */}
          <VirtualizedListingsList
            listings={displayedListings}
            newListingIds={listingsQuery.newListingIds}
            sourceNameById={sourceNameById}
          />
        </div>
      </div>

      {mapOpen && (
        <Suspense fallback={null}>
          <MapFilterModal
            open={mapOpen}
            onClose={() => setMapOpen(false)}
            filters={filters}
            setFilters={setFilters}
            listings={listings}
          />
        </Suspense>
      )}
    </div>
  );
}
