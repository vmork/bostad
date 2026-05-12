import { lazy, memo, Suspense, useDeferredValue, useEffect, useMemo, useState } from "react";
import { MapIcon } from "lucide-react";

import { FilterDropdown } from "./components/FilterDropdown";
import { ListingUI } from "./components/ListingUI";
import { RefetchButton } from "./components/RefetchButton";
import { SortDropdown } from "./components/SortDropdown";

import { type Listing, type ListingParseError, type ListingSourceStats } from "./api/models";
import { useListingsData } from "./hooks/useListingsData";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { applyFiltersToList, deriveContextualFilterStats, sortList } from "./lib/filterSort";
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
          className="rounded-md border border-gs-3/50 bg-gs-1 px-3 py-2 text-xs text-dark"
        >
          <span className="text-xs font-medium">{stat.name}:</span>
          <span className="ml-2 text-gs-3">{stat.numListings ?? 0} listings</span>
          <span className="ml-1 text-gs-3">· {stat.numErrors ?? 0} errors</span>
          <span className="ml-1 text-gs-3">
            · {stat.loggedIn == null ? "Login unknown" : stat.loggedIn ? "Logged in" : "Logged out"}
          </span>
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

const ListingsList = memo(function ListingsList({
  listings,
  filteredListings,
  newListingIds,
  sourceNameById,
}: {
  listings: Listing[];
  filteredListings: Listing[];
  newListingIds: Set<string>;
  sourceNameById: Record<string, { name: string; globalUrl: string }>;
}) {
  return (
    <div className="space-y-3">
      {filteredListings.map((listing) => (
        <ListingUI
          key={listing.id}
          listing={listing}
          isNew={newListingIds.has(listing.id)}
          sourceName={sourceNameById[listing.source]?.name ?? listing.source}
        />
      ))}
    </div>
  );
});

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

  const numApartments = listings.map((x) => x.numApartments ?? 0).reduce((a, b) => a + b, 0);

  const _defaultSortEntries = useMemo(() => buildSortEntries(), []);
  const [filters, setFilters] = useState(() => hydrateFilters(storedFilterStates, listings));
  const [sortEntries, setSortEntries] = useState(() => hydrateSortEntries(storedSortStates));
  const [mapOpen, setMapOpen] = useState(false);

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

  const displayFilters = useMemo(
    () => deriveContextualFilterStats(filters, listings),
    [filters, listings],
  );

  const displayedListings = useMemo(() => {
    const filtered = applyFiltersToList(listings, filters);
    return sortList(filtered, sortEntries);
  }, [listings, filters, sortEntries]);

  const deferredDisplayedListings = useDeferredValue(displayedListings);
  const displayedListingsAreStale = deferredDisplayedListings !== displayedListings;
  const sourceNameById = useMemo(
    () => mergeSourceMetadata(listingsQuery.sourceStats),
    [listingsQuery.sourceStats],
  );

  // if (displayedListings) {
  //   console.log(displayedListings);
  // }

  return (
    <div className="min-h-screen bg-background px-6 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Before listings */}
        <div className="mb-0">
          {/* Header */}
          <h1
            className={cn(
              "text-2xl font-semibold text-dark grow",
              displayedListingsAreStale && "opacity-50",
            )}
          >
            {listingsQuery.hasCachedData
              ? `Showing ${displayedListings.length}/${listings.length} listings (${numApartments} apts.)`
              : "No listings yet"}
          </h1>

          {/* Row 1: Refetch button and update info */}
          <div className="flex items-center justify-between gap-3 mt-2">
            <div className="">
              <RefetchButton
                hasCachedData={listingsQuery.hasCachedData}
                isFetching={listingsQuery.isFetching}
                progress={listingsQuery.progress}
                onFetch={listingsQuery.startListingsStream}
              />
            </div>
            {listingsQuery.updatedAt && (
              <p className="text-sm text-gs-3 mt-1">
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
            <div className="font-medium pb-0.5">Sources:</div>
            <div className="ml-2">
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
          <div className="flex gap-3 flex-wrap">
            {listingsQuery.hasCachedData && (
              <>
                <FilterDropdown filters={displayFilters} setFilters={setFilters} />
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
          <ListingsList
            listings={listings}
            filteredListings={deferredDisplayedListings}
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
            filters={displayFilters}
            setFilters={setFilters}
            listings={listings}
          />
        </Suspense>
      )}
    </div>
  );
}
