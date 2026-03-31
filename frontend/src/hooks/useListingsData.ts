import { useEffect, useRef, useState } from "react";

import { ListingSources, type AllListingsResponse } from "../api/models";
import {
  cacheKeyForSource,
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
};

interface UseListingsDataResult {
  data: AllListingsResponse;
  updatedAt: string | null;
  hasCachedData: boolean;
  isFetching: boolean;
  fetchError: string | null;
  progress: ScrapeProgress | null;
  loggedIn: boolean | null;
  startListingsStream: (options?: ListingsStreamOptions) => void;
  newListingIds: Set<string>;
  refreshDelta: {
    added: number;
    removed: number;
  }; // auto-clears after 60s
}

export function useListingsData(): UseListingsDataResult {
  const source = ListingSources.bostadsthlm;
  const cacheKey = cacheKeyForSource(source);

  const [cachedListings, setCachedListings] = useState<CachedListings | null>(() =>
    readCachedListings(cacheKey),
  );
  const [progress, setProgress] = useState<ScrapeProgress | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(() => {
    if (!cachedListings) {
      return null;
    }
    return cachedListings.loggedIn ?? null;
  });
  const closeStreamRef = useRef<(() => void) | null>(null);
  const latestLoggedInRef = useRef<boolean | null>(loggedIn);
  const newCountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [newListingIds, setNewListingIds] = useState<Set<string>>(new Set());
  const [refreshDelta, setRefreshDelta] = useState({ added: 0, removed: 0 });

  useEffect(() => {
    latestLoggedInRef.current = loggedIn;
  }, [loggedIn]);

  useEffect(() => {
    return () => {
      closeStreamRef.current?.();
      closeStreamRef.current = null;
      if (newCountTimerRef.current) clearTimeout(newCountTimerRef.current);
    };
  }, []);

  const startListingsStream = (options?: ListingsStreamOptions) => {
    if (closeStreamRef.current) {
      return;
    }

    setIsFetching(true);
    setFetchError(null);
    setProgress(null);
    setLoggedIn(null);

    closeStreamRef.current = openListingsStream(
      LISTINGS_STREAM_URL,
      {
        onProgress: (nextProgress) => {
          setProgress(nextProgress);
          if (typeof nextProgress.loggedIn === "boolean") {
            setLoggedIn(nextProgress.loggedIn);
          }
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

          const nextCachedListings = {
            data: payload,
            updatedAt: new Date().toISOString(),
            loggedIn: latestLoggedInRef.current,
          };

          setIsFetching(false);
          setFetchError(null);
          setCachedListings(nextCachedListings);
          writeCachedListings(cacheKey, nextCachedListings);
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

  return {
    data: cachedListings?.data ?? EMPTY_RESPONSE,
    updatedAt: cachedListings?.updatedAt ?? null,
    hasCachedData: Boolean(cachedListings),
    isFetching,
    fetchError,
    progress,
    loggedIn,
    startListingsStream,
    newListingIds,
    refreshDelta,
  };
}
