import {
  ListingSources as ListingSourceValues,
  type AllListingsResponse,
  type ListingSourceStats,
  type ListingSources,
  type ListingsSearchOptions,
} from "../api/models";

export const LISTINGS_STREAM_URL = "/api/all_listings/stream";
export const LISTINGS_CACHE_KEY = "bostad:listings-cache:all";
export const DEFAULT_LISTING_SOURCES: ListingSources[] = [
  ListingSourceValues.bostadsthlm,
  ListingSourceValues.homeq,
];

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
  source?: ListingSources;
  sourceStats?: ListingSourceStats[];
  message?: string;
}

export interface ListingsStreamEvent {
  event: ScrapeEventStatus;
  progress: ScrapeProgress;
  data?: AllListingsResponse;
}

export type ListingsStreamOptions = ListingsSearchOptions;

export function readCachedListings(cacheKey: string = LISTINGS_CACHE_KEY): CachedListings | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(cacheKey);
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

export function writeCachedListings(
  payload: CachedListings,
  cacheKey: string = LISTINGS_CACHE_KEY,
): void {
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

interface ParsedSseChunk {
  event: string | null;
  data: string;
}

function parseSseChunk(chunk: string): ParsedSseChunk {
  const lines = chunk.split(/\r?\n/);
  let event: string | null = null;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }

  return {
    event,
    data: dataLines.join("\n"),
  };
}

export function openListingsStream(
  url: string,
  callbacks: StreamCallbacks,
  options?: ListingsStreamOptions,
): () => void {
  const abortController = new AbortController();
  let isFinished = false;

  const closeStream = () => {
    abortController.abort();
  };

  const fail = (message: string, progress?: ScrapeProgress) => {
    if (isFinished) {
      return;
    }
    isFinished = true;
    callbacks.onFailure(message, progress);
    closeStream();
  };

  const handleEventPayload = (rawData: string, expected: ScrapeEventStatus) => {
    const parsedEvent = parseStreamEvent(rawData);
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

  void (async () => {
    const decoder = new TextDecoder();
    let eventBuffer = "";

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(options ?? { sources: DEFAULT_LISTING_SOURCES }),
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        fail(`Failed to start listings stream (${response.status}).`);
        return;
      }

      const reader = response.body.getReader();

      while (!isFinished) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        eventBuffer += decoder.decode(value, { stream: true });
        let separatorIndex = eventBuffer.indexOf("\n\n");

        while (separatorIndex !== -1) {
          const chunk = eventBuffer.slice(0, separatorIndex).trim();
          eventBuffer = eventBuffer.slice(separatorIndex + 2);

          if (chunk.length > 0) {
            const parsedChunk = parseSseChunk(chunk);
            if (parsedChunk.event === "started") {
              handleEventPayload(parsedChunk.data, "started");
            } else if (parsedChunk.event === "progress") {
              handleEventPayload(parsedChunk.data, "progress");
            } else if (parsedChunk.event === "complete") {
              handleEventPayload(parsedChunk.data, "complete");
            } else if (parsedChunk.event === "failed") {
              handleEventPayload(parsedChunk.data, "failed");
            }
          }

          separatorIndex = eventBuffer.indexOf("\n\n");
        }
      }

      if (!isFinished) {
        fail("The listings stream connection was interrupted.");
      }
    } catch (error) {
      if (abortController.signal.aborted || isFinished) {
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown stream error";
      fail(`The listings stream connection was interrupted: ${message}`);
    }
  })();

  return closeStream;
}
