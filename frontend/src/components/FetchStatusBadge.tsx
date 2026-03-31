import type { ScrapeProgress } from "../lib/listingsStreamService";

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

export function FetchStatusBadge({ progress }: { progress: ScrapeProgress | null }) {
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

      <div className="flex min-w-0 items-center gap-3 text-sm text-dark">
        {progressCount && (
          <span className="shrink-0 text-sm tracking-tight text-dark">{progressCount}</span>
        )}
        {progressCount && <span className="h-5 w-px bg-gs-2" aria-hidden="true" />}
        <span className="min-w-0 truncate text-small tracking-tight text-dark">{statusLabel}</span>
      </div>
    </div>
  );
}
