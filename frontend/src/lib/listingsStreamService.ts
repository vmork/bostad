import type { AllListingsResponse } from "../api/models";

export const LISTINGS_STREAM_URL = "/api/all_listings/stream";
const LEGACY_LISTINGS_CACHE_KEY = "bostad:listings-cache";

export interface CachedListings {
  data: AllListingsResponse;
  updatedAt: string;
}

export type ScrapeEventStatus = "started" | "progress" | "complete" | "failed";

export interface ScrapeProgress {
  status: ScrapeEventStatus;
  current: number;
  total: number;
  errors: number;
  listingId?: string;
  source?: "bostadsthlm";
  message?: string;
}

export interface ListingsStreamEvent {
  event: ScrapeEventStatus;
  progress: ScrapeProgress;
  data?: AllListingsResponse;
}

export function cacheKeyForSource(source: "bostadsthlm"): string {
  return `bostad:listings-cache:${source}`;
}

export function readCachedListings(cacheKey: string): CachedListings | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(cacheKey)
    ?? window.localStorage.getItem(LEGACY_LISTINGS_CACHE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as CachedListings;
  } catch {
    window.localStorage.removeItem(cacheKey);
    return null;
  }
}

export function writeCachedListings(cacheKey: string, payload: CachedListings): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(cacheKey, JSON.stringify(payload));
}

export function isAllListingsResponse(value: unknown): value is AllListingsResponse {
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

interface StreamCallbacks {
  onProgress: (progress: ScrapeProgress) => void;
  onComplete: (payload: AllListingsResponse) => void;
  onFailure: (message: string, progress?: ScrapeProgress) => void;
}

export function openListingsStream(
  url: string,
  callbacks: StreamCallbacks,
): () => void {
  const eventSource = new EventSource(url);
  let isFinished = false;

  const closeStream = () => {
    eventSource.close();
  };

  const fail = (message: string, progress?: ScrapeProgress) => {
    if (isFinished) {
      return;
    }
    isFinished = true;
    callbacks.onFailure(message, progress);
    closeStream();
  };

  const handleEvent = (event: MessageEvent<string>, expected: ScrapeEventStatus) => {
    const parsedEvent = parseStreamEvent(event.data);
    if (!parsedEvent || parsedEvent.event !== expected) {
      fail("Received an invalid listings stream response.");
      return;
    }

    callbacks.onProgress(parsedEvent.progress);

    if (parsedEvent.event === "complete") {
      if (!isAllListingsResponse(parsedEvent.data)) {
        fail("Listings stream completed without valid data.");
        return;
      }

      isFinished = true;
      callbacks.onComplete(parsedEvent.data);
      closeStream();
      return;
    }

    if (parsedEvent.event === "failed") {
      fail(parsedEvent.progress.message ?? "Failed to fetch listings.", parsedEvent.progress);
    }
  };

  eventSource.addEventListener("started", event => {
    handleEvent(event as MessageEvent<string>, "started");
  });
  eventSource.addEventListener("progress", event => {
    handleEvent(event as MessageEvent<string>, "progress");
  });
  eventSource.addEventListener("complete", event => {
    handleEvent(event as MessageEvent<string>, "complete");
  });
  eventSource.addEventListener("failed", event => {
    handleEvent(event as MessageEvent<string>, "failed");
  });

  eventSource.onerror = () => {
    if (isFinished) {
      return;
    }
    fail("The listings stream connection was interrupted.");
  };

  return closeStream;
}
