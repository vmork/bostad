import { useEffect, useRef, useState } from "react";

import type { AllListingsResponse, ListingSourceStats } from "../api/models";
import {
  buildCachedListings,
  isAllListingsResponse,
  LISTINGS_CACHE_KEY,
  LISTINGS_STREAM_URL,
  openListingsStream,
  readCachedListings,
  type CachedListings,
  type ListingsStreamOptions,
  type ScrapeProgress,
  writeCachedListings,
} from "../lib/listingsStreamService";

const EMPTY_RESPONSE: AllListingsResponse = {
  listings: [],
  errors: [],
  sourceStats: [],
};

interface UseListingsDataResult {
  data: AllListingsResponse;
  updatedAt: string | null;
  hasCachedData: boolean;
  isFetching: boolean;
  fetchError: string | null;
  progress: ScrapeProgress | null;
  sourceStats: ListingSourceStats[];
  startListingsStream: (options?: ListingsStreamOptions) => void;
  newListingIds: Set<string>;
  refreshDelta: {
    added: number;
    removed: number;
  }; // auto-clears after 60s
}

export function useListingsData(): UseListingsDataResult {
  const [cachedListings, setCachedListings] = useState<CachedListings | null>(() =>
    readCachedListings(LISTINGS_CACHE_KEY),
  );
  const [progress, setProgress] = useState<ScrapeProgress | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const closeStreamRef = useRef<(() => void) | null>(null);
  const newCountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [newListingIds, setNewListingIds] = useState<Set<string>>(new Set());
  const [refreshDelta, setRefreshDelta] = useState({ added: 0, removed: 0 });

  useEffect(() => {
    return () => {
      closeStreamRef.current?.();
      closeStreamRef.current = null;
      if (newCountTimerRef.current) clearTimeout(newCountTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (cachedListings !== null) {
      return;
    }

    const abortController = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/api/all_listings", {
          signal: abortController.signal,
        });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as AllListingsResponse;
        if (!isAllListingsResponse(payload)) {
          return;
        }

        const nextCachedListings = buildCachedListings(payload);
        setCachedListings(nextCachedListings);
        writeCachedListings(nextCachedListings, LISTINGS_CACHE_KEY);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [cachedListings]);

  const startListingsStream = (options?: ListingsStreamOptions) => {
    if (closeStreamRef.current) {
      return;
    }

    setIsFetching(true);
    setFetchError(null);
    setProgress(null);

    closeStreamRef.current = openListingsStream(
      LISTINGS_STREAM_URL,
      {
        onProgress: (nextProgress) => {
          setProgress(nextProgress);
        },
        onComplete: (payload) => {
          // Detect new listings relative to previous cache
          const oldIds = new Set(
            (cachedListings?.data.listings ?? []).map((listing) => listing.id),
          );
          const nextIds = new Set(payload.listings.map((listing) => listing.id));
          const addedIds = new Set(
            payload.listings
              .filter((listing) => !oldIds.has(listing.id))
              .map((listing) => listing.id),
          );
          const removedCount = [...oldIds].filter((id) => !nextIds.has(id)).length;

          setNewListingIds(addedIds);
          setRefreshDelta({ added: addedIds.size, removed: removedCount });
          if (newCountTimerRef.current) clearTimeout(newCountTimerRef.current);
          if (addedIds.size > 0 || removedCount > 0) {
            newCountTimerRef.current = setTimeout(
              () => setRefreshDelta({ added: 0, removed: 0 }),
              60_000,
            );
          }

          const nextCachedListings = buildCachedListings(payload);

          setIsFetching(false);
          setFetchError(null);
          setCachedListings(nextCachedListings);
          writeCachedListings(nextCachedListings, LISTINGS_CACHE_KEY);
          closeStreamRef.current = null;
        },
        onFailure: (message, nextProgress) => {
          setIsFetching(false);
          setFetchError(message);
          if (nextProgress) {
            setProgress(nextProgress);
          }
          closeStreamRef.current = null;
        },
      },
      options,
    );
  };

  const sourceStats = progress?.sourceStats ?? cachedListings?.data.sourceStats ?? [];

  return {
    data: cachedListings?.data ?? EMPTY_RESPONSE,
    updatedAt: cachedListings?.updatedAt ?? null,
    hasCachedData: Boolean(cachedListings),
    isFetching,
    fetchError,
    progress,
    sourceStats,
    startListingsStream,
    newListingIds,
    refreshDelta,
  };
}
