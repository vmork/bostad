import { useEffect, useRef, useState } from "react";
import type { AllListingsResponse } from "./api/models";
import { Button } from "./components/Button";
import { Listing } from "./components/Listing";
import { ListingError } from "./components/ListingError";

const LISTINGS_CACHE_KEY = "bostad:listings-cache";
const LISTINGS_STREAM_URL = "/api/all_listings/stream";
const EMPTY_RESPONSE: AllListingsResponse = {
  listings: [],
  errors: [],
};

interface CachedListings {
  data: AllListingsResponse;
  updatedAt: string;
}

type ScrapeEventStatus = "started" | "progress" | "complete" | "failed";

interface ScrapeProgress {
  status: ScrapeEventStatus;
  current: number;
  total: number;
  errors: number;
  listingId?: string;
  message?: string;
}

interface ListingsStreamEvent {
  event: ScrapeEventStatus;
  progress: ScrapeProgress;
  data?: AllListingsResponse;
}

function readCachedListings(): CachedListings | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(LISTINGS_CACHE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as CachedListings;
  } catch {
    window.localStorage.removeItem(LISTINGS_CACHE_KEY);
    return null;
  }
}

function writeCachedListings(payload: CachedListings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LISTINGS_CACHE_KEY, JSON.stringify(payload));
}

function formatUpdatedAt(updatedAt: string | null) {
  if (!updatedAt) {
    return null;
  }

  const parsedUpdatedAt = new Date(updatedAt).getTime();

  if (Number.isNaN(parsedUpdatedAt)) {
    return null;
  }

  const timeDelta = Date.now() - parsedUpdatedAt;

  if (timeDelta < 60 * 1000) {
    return "just now";
  } else if (timeDelta < 60 * 60 * 1000) {
    const minutes = Math.floor(timeDelta / (60 * 1000));
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  } else if (timeDelta < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(timeDelta / (60 * 60 * 1000));
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  } else {
    const days = Math.floor(timeDelta / (24 * 60 * 60 * 1000));
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }
}

function isAllListingsResponse(value: unknown): value is AllListingsResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AllListingsResponse>;
  return Array.isArray(candidate.listings) && Array.isArray(candidate.errors);
}

function parseStreamEvent(rawValue: string): ListingsStreamEvent | null {
  try {
    return JSON.parse(rawValue) as ListingsStreamEvent;
  } catch {
    return null;
  }
}

function formatProgressLabel(progress: ScrapeProgress | null) {
  if (!progress) {
    return "Connecting to listings stream...";
  }

  if (progress.status === "failed") {
    return progress.message ?? "Failed to fetch listings.";
  }

  if (progress.total === 0) {
    return "No listings to parse.";
  }

  if (progress.status === "complete") {
    return `Parsed ${progress.total} of ${progress.total} listings`;
  }

  return `Parsed ${progress.current} of ${progress.total} listings`;
}

export default function App() {
  const [showErrors, setShowErrors] = useState(false);
  const [cachedListings, setCachedListings] = useState<CachedListings | null>(
    () => readCachedListings(),
  );
  const [progress, setProgress] = useState<ScrapeProgress | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, []);

  function startListingsStream() {
    if (eventSourceRef.current) {
      return;
    }

    setIsFetching(true);
    setFetchError(null);
    setProgress(null);

    const eventSource = new EventSource(LISTINGS_STREAM_URL);
    let isFinished = false;
    eventSourceRef.current = eventSource;

    const closeStream = () => {
      eventSource.close();
      if (eventSourceRef.current === eventSource) {
        eventSourceRef.current = null;
      }
    };

    const handleFailure = (message: string, nextProgress?: ScrapeProgress) => {
      isFinished = true;
      setIsFetching(false);
      setFetchError(message);
      if (nextProgress) {
        setProgress(nextProgress);
      }
      closeStream();
    };

    const handleEvent = (
      event: MessageEvent<string>,
      expectedEvent: ScrapeEventStatus,
    ) => {
      const parsedEvent = parseStreamEvent(event.data);
      if (!parsedEvent || parsedEvent.event !== expectedEvent) {
        handleFailure("Received an invalid listings stream response.");
        return;
      }

      setProgress(parsedEvent.progress);

      if (parsedEvent.event === "complete") {
        if (!isAllListingsResponse(parsedEvent.data)) {
          handleFailure("Listings stream completed without valid data.");
          return;
        }

        const nextCachedListings = {
          data: parsedEvent.data,
          updatedAt: new Date().toISOString(),
        };

        isFinished = true;
        setIsFetching(false);
        setFetchError(null);
        setCachedListings(nextCachedListings);
        writeCachedListings(nextCachedListings);
        closeStream();
        return;
      }

      if (parsedEvent.event === "failed") {
        handleFailure(
          parsedEvent.progress.message ?? "Failed to fetch listings.",
          parsedEvent.progress,
        );
      }
    };

    eventSource.addEventListener("started", (event) => {
      handleEvent(event as MessageEvent<string>, "started");
    });
    eventSource.addEventListener("progress", (event) => {
      handleEvent(event as MessageEvent<string>, "progress");
    });
    eventSource.addEventListener("complete", (event) => {
      handleEvent(event as MessageEvent<string>, "complete");
    });
    eventSource.addEventListener("failed", (event) => {
      handleEvent(event as MessageEvent<string>, "failed");
    });
    eventSource.onerror = () => {
      if (isFinished) {
        return;
      }

      handleFailure("The listings stream connection was interrupted.");
    };
  }

  useEffect(() => {
    if (!cachedListings) {
      startListingsStream();
    }
  }, []);

  const data = cachedListings?.data ?? EMPTY_RESPONSE;
  const updatedAt = formatUpdatedAt(cachedListings?.updatedAt ?? null);
  const hasCachedData = Boolean(cachedListings);
  const showBlockingError = Boolean(fetchError) && !hasCachedData;
  const progressValue = progress?.total
    ? (progress.current / progress.total) * 100
    : 0;

  const { listings, errors } = data;

  if (isFetching && !hasCachedData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-white p-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">
              Fetching listings
            </h2>
            <p className="text-sm text-muted">
              {formatProgressLabel(progress)}
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full bg-primary transition-[width] duration-300"
              style={{ width: `${progressValue}%` }}
            />
          </div>
          {progress && progress.errors > 0 && (
            <p className="text-sm text-muted">
              {progress.errors} listing{progress.errors > 1 ? "s" : ""} failed
              to parse so far.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (showBlockingError) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-lg border border-red-300 bg-red-50 p-6">
            <h2 className="mb-2 text-lg font-semibold text-red-900">
              Error fetching listings:
            </h2>
            <p className="text-red-700">{fetchError}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
              {listings.length} listings
            </span>
            {errors.length > 0 && (
              <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
                {errors.length} errors
              </span>
            )}
            {updatedAt && (
              <span className="text-sm text-muted">Updated {updatedAt}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => startListingsStream()}
              loading={isFetching}
              variant="secondary"
            >
              {isFetching ? "Updating..." : "Update listings"}
            </Button>
            {errors.length > 0 && (
              <Button
                onClick={() => setShowErrors(!showErrors)}
                variant="ghost"
              >
                {showErrors ? "Hide" : "Show"} parse errors
              </Button>
            )}
          </div>
        </div>

        {isFetching && progress && (
          <div className="rounded-lg border border-border bg-white p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-foreground">
                Updating listings
              </h2>
              <span className="text-sm text-muted">
                {progress.current}/{progress.total || "?"}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{ width: `${progressValue}%` }}
              />
            </div>
          </div>
        )}

        {fetchError && hasCachedData && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4">
            <h2 className="mb-2 text-lg font-semibold text-red-900">
              Could not refresh listings
            </h2>
            <p className="text-sm text-red-700">{fetchError}</p>
            <p className="mt-2 text-sm text-red-700">
              Showing the latest cached result instead.
            </p>
          </div>
        )}

        {errors.length > 0 && showErrors && (
          <div className="space-y-3">
            {errors.map((error) => (
              <ListingError key={error.id} error={error} />
            ))}
          </div>
        )}

        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Listings</h2>
          <div className="space-y-3">
            {listings.map((listing) => (
              <Listing key={listing.id} listing={listing} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
