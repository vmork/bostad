import { memo, useEffect, useMemo, useState, useDeferredValue } from "react";
import { MapIcon } from "lucide-react";

import { FilterDropdown } from "./components/FilterDropdown";
import { ListingUI } from "./components/ListingUI";
import { MapFilterModal } from "./components/MapFilterModal";
import { RefetchButton } from "./components/RefetchButton";
import { SortDropdown } from "./components/SortDropdown";

import { type Listing, type ListingParseError } from "./api/models";
import { useListingsData } from "./hooks/useListingsData";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { applyFiltersToList, sortList } from "./lib/filterSort";
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
import { cn, formatUpdatedAt } from "./lib/utils";
import { Button } from "./components/generic/Button";

const LISTINGS_FILTERS_STORAGE_KEY = "listingsFilters";
const LISTINGS_SORT_STORAGE_KEY = "listingsSort";

function ParseErrorsPanel({ errors }: { errors: ListingParseError[] }) {
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
  filteredListings,
  newListingIds,
}: {
  filteredListings: Listing[];
  newListingIds: Set<string>;
}) {
  return (
    <div className="space-y-3">
      {filteredListings.map((listing) => (
        <ListingUI key={listing.id} listing={listing} isNew={newListingIds.has(listing.id)} />
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

  const displayedListings = useMemo(() => {
    const filtered = applyFiltersToList(listings, filters);
    return sortList(filtered, sortEntries);
  }, [listings, filters, sortEntries]);

  const deferredDisplayedListings = useDeferredValue(displayedListings);
  const displayedListingsAreStale = deferredDisplayedListings !== displayedListings;

  // if (displayedListings) {
  //   console.log(displayedListings);
  // }

  return (
    <div className="min-h-screen bg-background px-6 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header section */}
        <div className="flex flex-col gap-3 mb-3">
          <div className="">
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
            {listingsQuery.updatedAt && (
              <p className="text-sm text-gs-3 mt-2">
                Updated {formatUpdatedAt(listingsQuery.updatedAt)}
                {listingsQuery.loggedIn !== null && (
                  <span className="ml-2">
                    · {listingsQuery.loggedIn ? "logged in" : "not logged in"}
                  </span>
                )}
                {(listingsQuery.refreshDelta.added > 0 ||
                  listingsQuery.refreshDelta.removed > 0) && (
                  <span className="text-primary ml-2 font-medium">
                    {listingsQuery.refreshDelta.added > 0 && (
                      <>Added {listingsQuery.refreshDelta.added}</>
                    )}
                    {listingsQuery.refreshDelta.added > 0 &&
                      listingsQuery.refreshDelta.removed > 0 &&
                      " · "}
                    {listingsQuery.refreshDelta.removed > 0 && (
                      <>Removed {listingsQuery.refreshDelta.removed}</>
                    )}
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Blocking fetch error */}
          {listingsQuery.fetchError && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-4">
              <h2 className="mb-2 text-lg font-semibold text-red-900">Could not fetch listings</h2>
              <p className="text-sm text-red-700">{listingsQuery.fetchError}</p>
            </div>
          )}
          {/* List of non-blocking parse errors */}
          {errors.length > 0 && <ParseErrorsPanel errors={errors} />}

          {/* Controls */}
          <div className="flex gap-3 flex-wrap">
            <RefetchButton
              hasCachedData={listingsQuery.hasCachedData}
              isFetching={listingsQuery.isFetching}
              progress={listingsQuery.progress}
              onFetch={listingsQuery.startListingsStream}
            />

            {listingsQuery.hasCachedData && (
              <>
                <FilterDropdown filters={filters} setFilters={setFilters} />

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
        </div>

        {/* Main listings section */}
        <ListingsList
          filteredListings={deferredDisplayedListings}
          newListingIds={listingsQuery.newListingIds}
        />
      </div>

      <MapFilterModal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        filters={filters}
        setFilters={setFilters}
        listings={listings}
      />
    </div>
  );
}
