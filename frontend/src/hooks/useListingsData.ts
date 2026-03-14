import { useEffect, useRef, useState } from "react";

import type { AllListingsResponse } from "../api/models";
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
}

export function useListingsData(): UseListingsDataResult {
  const source = "bostadsthlm" as const;
  const cacheKey = cacheKeyForSource(source);

  const [cachedListings, setCachedListings] = useState<CachedListings | null>(
    () => readCachedListings(cacheKey),
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

  useEffect(() => {
    latestLoggedInRef.current = loggedIn;
  }, [loggedIn]);

  useEffect(() => {
    return () => {
      closeStreamRef.current?.();
      closeStreamRef.current = null;
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
  };
}
