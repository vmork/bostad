import { useEffect, useRef, useState } from "react";
import type { AllListingsResponse } from "./api/models";
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

function formatHeaderStatusLabel(progress: ScrapeProgress | null) {
  if (!progress || progress.status === "started") {
    return "Fetching listings...";
  }

  if (progress.status === "failed") {
    return progress.message ?? "Failed to fetch listings.";
  }

  if (progress.total === 0) {
    return "No listings to parse.";
  }

  if (progress.status === "complete") {
    return "Finished parsing listing pages.";
  }

  return "Parsing listing pages...";
}

function formatHeaderProgress(progress: ScrapeProgress | null) {
  if (!progress || progress.total === 0) {
    return null;
  }

  return `${Math.min(progress.current, progress.total)}/${progress.total}`;
}

function getProgressRatio(progress: ScrapeProgress | null) {
  if (!progress || progress.total === 0) {
    return null;
  }

  return Math.max(0, Math.min(progress.current / progress.total, 1));
}

interface FetchStatusBadgeProps {
  progress: ScrapeProgress | null;
}

function FetchStatusBadge({ progress }: FetchStatusBadgeProps) {
  const progressRatio = getProgressRatio(progress);
  const progressCount = formatHeaderProgress(progress);
  const statusLabel = formatHeaderStatusLabel(progress);

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex size-6 items-center justify-center">
        {progressRatio === null ? (
          <span
            aria-hidden="true"
            className="size-6 rounded-full border-[3px] border-zinc-300 border-t-zinc-700 animate-spin"
          />
        ) : (
          <span
            aria-hidden="true"
            className="relative size-6 rounded-full"
            style={{
              background: `conic-gradient(#16a34a ${progressRatio * 360}deg, #d4d4d8 0deg)`,
            }}
          >
            <span className="absolute inset-1 rounded-full bg-white" />
          </span>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-3 text-sm text-foreground">
        {progressCount && (
          <span className="shrink-0 text-sm tracking-tight text-foreground">
            {progressCount}
          </span>
        )}
        {progressCount && (
          <span className="h-5 w-px bg-border" aria-hidden="true" />
        )}
        <span className="min-w-0 truncate text-small tracking-tight text-foreground">
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

export default function App() {
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

  const data = cachedListings?.data ?? EMPTY_RESPONSE;
  const updatedAt = formatUpdatedAt(cachedListings?.updatedAt ?? null);
  const hasCachedData = Boolean(cachedListings);

  const { listings, errors } = data;

  const numApartments = listings.map(x => x.numApartments ?? 0).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-background px-6 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header section */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2">
            <h1 className="text-2xl font-semibold text-foreground grow">
              {hasCachedData
                ? `Showing ${listings.length} listings with ${numApartments} apartments`
                : "No listings yet"} 
            </h1>
            {updatedAt && (
              <p className="text-sm text-muted">Updated {updatedAt}</p>
            )}
          </div>

          <button
            onClick={() => startListingsStream()}
            disabled={isFetching}
            className="flex w-fit py-2 px-2 items-center border border-border rounded-xl cursor-pointer disabled:cursor-default"
          >
            {isFetching ? (
              <FetchStatusBadge progress={progress} />
            ) : (
              <span className="text-base">{hasCachedData ? "Refetch" : "Fetch listings"}</span>
            )}
          </button>
        </div>

        {/* Blocking fetch error */}
        {fetchError && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4">
            <h2 className="mb-2 text-lg font-semibold text-red-900">
              Could not fetch listings
            </h2>
            <p className="text-sm text-red-700">{fetchError}</p>
          </div>
        )}
        {/* List of non-blocking parse errors */}
        {errors.length > 0 && (
          <div>
            <span className="text-sm text-muted">
              Unable to parse {errors.length} listing
              {errors.length === 1 ? "" : "s"}:
            </span>
            <div className="space-y-3">
              {errors.map((error) => (
                <ListingError key={error.id} error={error} />
              ))}
            </div>
          </div>
        )}

        {/* Filters and sorting section */}
        <div className="rounded-xl border border-dashed border-border bg-white/70 px-2 py-2 text-base text-muted shadow-sm">
          (Filters, Sorting)
        </div>

        {/* Main listings section */}
        <div className="space-y-3">
          {listings.map((listing) => (
            <Listing key={listing.id} listing={listing} />
          ))}
        </div>
      </div>
    </div>
  );
}
