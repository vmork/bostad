import { SettingsIcon } from "lucide-react";
import { ListingSources } from "../api/models";
import { useLocalStorage } from "../hooks/useLocalStorage";
import type { ListingsStreamOptions, ScrapeProgress } from "../lib/listingsStreamService";
import { cn } from "../lib/utils";
import { FetchStatusBadge } from "./FetchStatusBadge";
import { Button } from "./generic/Button";
import { Dropdown } from "./generic/Dropdown";

const defaultSearchOptions: ListingsStreamOptions = {
  sources: [ListingSources.bostadsthlm],
  maxListings: undefined,
  cookie: undefined,
};

function DataSettings({
  searchOptions,
  setSearchOptions,
}: {
  searchOptions: ListingsStreamOptions;
  setSearchOptions: (options: ListingsStreamOptions) => void;
}) {
  const handleCookieChange = (value: string) => {
    setSearchOptions({ ...searchOptions, cookie: value || undefined });
  };

  const handleMaxListingsChange = (value: string) => {
    setSearchOptions({
      ...searchOptions,
      maxListings: value ? parseInt(value, 10) : undefined,
    });
  };

  // Whether any option deviates from defaults
  const hasCustomOptions = searchOptions.cookie != null || searchOptions.maxListings != null;

  return (
    <Dropdown.Root triggerMode="hover" preferredSide="bottom" mobileBreakpoint={768} gap={5}>
      <Dropdown.Trigger asChild>
        <Button
          size="large"
          className={cn(
            "w-fit rounded-l-none border-l-0",
            hasCustomOptions && "border-primary/60 bg-primary/10 text-primary",
          )}
        >
          <SettingsIcon size={15} />
          <span className="mx-1 text-xs">Options</span>
        </Button>
      </Dropdown.Trigger>

      <Dropdown.Content className="border border-gs-3/50 w-[min(22rem,calc(100vw-1.5rem))]">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] grid-rows-3 items-center gap-x-3 gap-y-2 px-3 py-3">
          <span className="text-xs uppercase text-gs-4">Cookie:</span>
          <input
            type="text"
            className={cn(
              "w-full no-spinner rounded-md pl-1.5 pr-1 py-1.5 text-xs text-gs-4 border border-gs-3/50 focus:border-primary",
              searchOptions.cookie != null && "border-primary",
            )}
            placeholder="Enter cookie"
            value={searchOptions.cookie ?? ""}
            onChange={(event) => handleCookieChange(event.target.value)}
          />

          <span className="text-xs uppercase text-gs-4">Max listings:</span>
          <input
            type="number"
            className={cn(
              "w-15 justify-self-end no-spinner rounded-md pl-1.5 pr-1 py-1.5 text-xs text-gs-4 border border-gs-3/50 focus:border-primary",
              searchOptions.maxListings != null && "border-primary",
            )}
            placeholder="∞"
            value={searchOptions.maxListings ?? ""}
            onChange={(event) => handleMaxListingsChange(event.target.value)}
            min={1}
          />

          <span className="text-xs uppercase text-gs-4">Sources:</span>
          <span className="text-xs justify-self-end text-gs-4">
            {(searchOptions.sources ?? []).join(", ") || "None"}
          </span>
        </div>
      </Dropdown.Content>
    </Dropdown.Root>
  );
}

export function RefetchButton({
  hasCachedData,
  isFetching,
  progress,
  onFetch,
}: {
  hasCachedData: boolean;
  isFetching: boolean;
  progress: ScrapeProgress | null;
  onFetch: (options: ListingsStreamOptions) => void;
}) {
  const [searchOptions, setSearchOptions] = useLocalStorage<ListingsStreamOptions>(
    "searchOptions",
    defaultSearchOptions,
  );

  return (
    <div className="flex flex-wrap items-center gap-0">
      <Button
        size="large"
        onClick={() => onFetch(searchOptions)}
        disabled={isFetching}
        className="rounded-r-none"
      >
        {isFetching ? (
          <FetchStatusBadge progress={progress} />
        ) : (
          <span className="text-base">{hasCachedData ? "Update data" : "Get data"}</span>
        )}
      </Button>
      <DataSettings searchOptions={searchOptions} setSearchOptions={setSearchOptions} />
    </div>
  );
}
