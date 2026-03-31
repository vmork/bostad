import { SettingsIcon } from "lucide-react";
import { ListingSources } from "../api/models";
import { useLocalStorage } from "../hooks/useLocalStorage";
import type { ListingsStreamOptions, ScrapeProgress } from "../lib/listingsStreamService";
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

  return (
    <Dropdown.Root triggerMode="hover" preferredSide="bottom" mobileBreakpoint={768} gap={5}>
      <Dropdown.Trigger asChild>
        <Button variant="dark" size="large" className="w-fit rounded-l-none border-l-none">
          <SettingsIcon size={15} className="text-gs-3" />
          <span className="mx-1 text-xs">Options</span>
        </Button>
      </Dropdown.Trigger>

      <Dropdown.Content className="w-[min(22rem,calc(100vw-1.5rem))]">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] grid-rows-3 items-center gap-x-3 gap-y-2 px-3 py-3">
          <span className="text-xs uppercase text-gs-3">Cookie:</span>
          <input
            type="text"
            className="w-full rounded border border-gs-2 bg-background px-2 py-1.5 text-sm text-dark"
            placeholder="Enter cookie"
            value={searchOptions.cookie ?? ""}
            onChange={(event) => handleCookieChange(event.target.value)}
          />

          <span className="text-xs uppercase text-gs-3">Max listings:</span>
          <input
            type="number"
            className="w-15 justify-self-end rounded border border-gs-2 bg-background px-2 py-1.5 text-right text-sm text-dark focus:border-green-50"
            placeholder="∞"
            value={searchOptions.maxListings ?? ""}
            onChange={(event) => handleMaxListingsChange(event.target.value)}
            min={1}
          />

          <span className="text-xs uppercase text-gs-3">Sources:</span>
          <span className="text-sm justify-self-end text-dark">
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
