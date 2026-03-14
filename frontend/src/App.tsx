import { useListingsData } from "./hooks/useListingsData";
import { Listing } from "./components/Listing";
import { ListingError } from "./components/ListingError";
import type {
  ListingsStreamOptions,
  ScrapeProgress,
} from "./lib/listingsStreamService";
import { formatDuration } from "./lib/utils";
import { useEffect, useState } from "react";

const SEARCH_OPTIONS_STORAGE_KEY = "bostad:search-options";

function readStoredSearchOptions(): ListingsStreamOptions {
  if (typeof window === "undefined") {
    return { sources: ["bostadsthlm"] };
  }

  const rawValue = window.localStorage.getItem(SEARCH_OPTIONS_STORAGE_KEY);
  if (!rawValue) {
    return { sources: ["bostadsthlm"] };
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<ListingsStreamOptions>;
    return {
      sources: ["bostadsthlm"],
      cookie: typeof parsed.cookie === "string" ? parsed.cookie : undefined,
      maxListings:
        typeof parsed.maxListings === "number" && Number.isFinite(parsed.maxListings)
          ? parsed.maxListings
          : undefined,
    };
  } catch {
    return { sources: ["bostadsthlm"] };
  }
}

function normalizeSearchOptions(options: ListingsStreamOptions): ListingsStreamOptions {
  const normalizedCookie = options.cookie?.trim() || undefined;
  const normalizedMaxListings =
    typeof options.maxListings === "number"
      ? Number.isFinite(options.maxListings) && options.maxListings >= 1
        ? Math.floor(options.maxListings)
        : undefined
      : undefined;

  return {
    sources: ["bostadsthlm"],
    cookie: normalizedCookie,
    maxListings: normalizedMaxListings,
  };
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

  return formatDuration(timeDelta);
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
  const [searchOptions, setSearchOptions] = useState<ListingsStreamOptions>(() =>
    readStoredSearchOptions(),
  );
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const {
    data,
    updatedAt,
    hasCachedData,
    isFetching,
    fetchError,
    progress,
    loggedIn,
    startListingsStream,
  } = useListingsData();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      SEARCH_OPTIONS_STORAGE_KEY,
      JSON.stringify(searchOptions),
    );
  }, [searchOptions]);

  const prettyUpdatedAt = formatUpdatedAt(updatedAt);

  const { listings, errors } = data;

  const numApartments = listings
    .map((x) => x.numApartments ?? 0)
    .reduce((a, b) => a + b, 0);

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
            {prettyUpdatedAt && (
              <p className="text-sm text-muted">Updated {prettyUpdatedAt}</p>
            )}
          </div>

          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => startListingsStream(normalizeSearchOptions(searchOptions))}
                disabled={isFetching}
                className="flex w-fit py-2 px-2 items-center border border-border rounded-xl cursor-pointer disabled:cursor-default"
              >
                {isFetching ? (
                  <FetchStatusBadge progress={progress} />
                ) : (
                  <span className="text-base">
                    {hasCachedData ? "Refetch" : "Fetch listings"}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsOptionsOpen((isOpen) => !isOpen)}
                className="rounded-xl border border-border px-3 py-2 text-sm"
              >
                Options
              </button>
            </div>

            <span
              className={
                loggedIn === true
                  ? "shrink-0 text-sm text-green-700"
                  : loggedIn === false
                    ? "shrink-0 text-sm text-red-700"
                    : "shrink-0 text-sm text-zinc-600"
              }
              title={
                loggedIn === true
                  ? "Listings were fetched as logged-in. Queue position fields are available when provided by the source."
                  : loggedIn === false
                    ? "Not logged in. Paste a fresh cookie in the Cookie input and refetch listings to include logged-in queue fields."
                    : "Login status is unknown for the current data. Refetch listings after setting a cookie if queue fields are missing."
              }
            >
              {loggedIn === true
                ? "Logged in"
                : loggedIn === false
                  ? "Not logged in"
                  : "Login unknown"}
            </span>
          </div>

          {isOptionsOpen && (
            <div className="mt-2 rounded-xl border border-border bg-white/80 p-3">
              {/* Cookie settings */}
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Cookie (for logged-in queue fields)
                </label>
                <textarea
                  value={searchOptions.cookie ?? ""}
                  onChange={(event) =>
                    setSearchOptions((current) => ({
                      ...current,
                      cookie: event.target.value,
                    }))
                  }
                  placeholder="Paste cookie string from browser/curl"
                  className="h-24 w-full rounded-xl border border-border px-3 py-2 text-sm"
                />
              </div>

              {/* Debug fetch limits */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Max listings (debug only, blank = no limit)
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={searchOptions.maxListings ?? ""}
                  onChange={(event) => {
                    const rawValue = event.target.value;
                    if (rawValue.trim() === "") {
                      setSearchOptions((current) => ({
                        ...current,
                        maxListings: undefined,
                      }));
                      return;
                    }

                    const parsedValue = Number(rawValue);
                    setSearchOptions((current) => ({
                      ...current,
                      maxListings: Number.isFinite(parsedValue) ? parsedValue : undefined,
                    }));
                  }}
                  placeholder="No limit"
                  className="w-56 rounded-xl border border-border px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
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
