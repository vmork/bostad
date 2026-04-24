import { SettingsIcon } from "lucide-react";
import { ListingSources, type ListingsSearchOptions } from "../api/models";
import { useLocalStorage } from "../hooks/useLocalStorage";
import {
  DEFAULT_LISTING_SOURCES,
  type ListingsStreamOptions,
  type ScrapeProgress,
} from "../lib/listingsStreamService";
import { sourceMetadataById } from "../lib/sourceMetadata";
import { cn } from "../lib/utils";
import { FetchStatusBadge } from "./FetchStatusBadge";
import { Button } from "./generic/Button";
import { Checkbox } from "./generic/Checkbox";
import { Dropdown } from "./generic/Dropdown";

const defaultSearchOptions: ListingsStreamOptions = {
  sources: DEFAULT_LISTING_SOURCES,
  bostadsthlm: {},
  homeq: {},
};

const sourceOptionSections = [
  {
    id: ListingSources.bostadsthlm,
  },
  {
    id: ListingSources.homeq,
  },
];

function normalizeSearchOptions(options: ListingsSearchOptions): ListingsSearchOptions {
  return {
    sources: options.sources?.length ? options.sources : DEFAULT_LISTING_SOURCES,
    bostadsthlm: options.bostadsthlm ?? {},
    homeq: options.homeq ?? {},
  };
}

function DataSettings({
  searchOptions,
  setSearchOptions,
}: {
  searchOptions: ListingsStreamOptions;
  setSearchOptions: (options: ListingsStreamOptions) => void;
}) {
  const normalizedOptions = normalizeSearchOptions(searchOptions);

  const toggleSource = (source: (typeof ListingSources)[keyof typeof ListingSources]) => {
    const currentSources = normalizedOptions.sources ?? [];
    const nextSources = currentSources.includes(source)
      ? currentSources.filter((item) => item !== source)
      : [...currentSources, source];

    setSearchOptions({
      ...normalizedOptions,
      sources: nextSources,
    });
  };

  const updateBostadOptions = (update: NonNullable<ListingsSearchOptions["bostadsthlm"]>) => {
    setSearchOptions({
      ...normalizedOptions,
      bostadsthlm: {
        ...normalizedOptions.bostadsthlm,
        ...update,
      },
    });
  };

  const updateHomeQOptions = (update: NonNullable<ListingsSearchOptions["homeq"]>) => {
    setSearchOptions({
      ...normalizedOptions,
      homeq: {
        ...normalizedOptions.homeq,
        ...update,
      },
    });
  };

  const handleCookieChange = (value: string) => {
    updateBostadOptions({ cookie: value || undefined });
  };

  const handleMaxListingsChange = (value: string) => {
    updateBostadOptions({ maxListings: value ? parseInt(value, 10) : undefined });
  };

  const handleHomeQMaxListingsChange = (value: string) => {
    updateHomeQOptions({ maxListings: value ? parseInt(value, 10) : undefined });
  };

  const selectedSources = normalizedOptions.sources ?? [];
  const hasCustomOptions =
    selectedSources.length !== DEFAULT_LISTING_SOURCES.length ||
    selectedSources.some((source) => !DEFAULT_LISTING_SOURCES.includes(source)) ||
    normalizedOptions.bostadsthlm?.cookie != null ||
    normalizedOptions.bostadsthlm?.maxListings != null ||
    normalizedOptions.homeq?.maxListings != null;

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
          <span className="mx-1 text-xs">Sources</span>
        </Button>
      </Dropdown.Trigger>

      <Dropdown.Content className="border border-gs-3/50 w-[min(25rem,calc(100vw-1.5rem))]">
        <div className="py-2 flex flex-col">
          {sourceOptionSections.map((section) => {
            const metadata = sourceMetadataById[section.id];
            const enabled = selectedSources.includes(section.id);

            return (
              <div key={section.id}>
                <div className="p-2 flex items-center gap-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-gs-4">
                    {metadata.name}
                  </div>
                  <a
                    className="text-xs text-gs-3 hover:underline"
                    href={metadata.globalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ({metadata.globalUrl})
                  </a>
                </div>

                <div className="space-y-2 border-t border-gs-2/80 px-3 py-3">
                  <div className="flex items-center justify-between gap-3 pb-1">
                    <div className="min-w-0">
                      <div className="text-xs uppercase text-gs-4">Enabled:</div>
                    </div>
                    <Checkbox checked={enabled} onChange={() => toggleSource(section.id)} />
                  </div>

                  <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
                    {section.id === ListingSources.bostadsthlm ? (
                      <>
                        <span className="text-xs uppercase text-gs-4">Cookie:</span>
                        <input
                          type="text"
                          className={cn(
                            "w-full no-spinner rounded-md pl-1.5 pr-1 py-1.5 text-xs text-gs-4 border border-gs-3/50 focus:border-primary",
                            normalizedOptions.bostadsthlm?.cookie != null && "border-primary",
                          )}
                          placeholder="Enter cookie"
                          value={normalizedOptions.bostadsthlm?.cookie ?? ""}
                          onChange={(event) => handleCookieChange(event.target.value)}
                        />

                        <span className="text-xs uppercase text-gs-4">Max listings:</span>
                        <input
                          type="number"
                          className={cn(
                            "w-15 justify-self-end no-spinner rounded-md pl-1.5 pr-1 py-1.5 text-xs text-gs-4 border border-gs-3/50 focus:border-primary",
                            normalizedOptions.bostadsthlm?.maxListings != null && "border-primary",
                          )}
                          placeholder="∞"
                          value={normalizedOptions.bostadsthlm?.maxListings ?? ""}
                          onChange={(event) => handleMaxListingsChange(event.target.value)}
                          min={1}
                        />
                      </>
                    ) : (
                      <>
                        <span className="text-xs uppercase text-gs-4">Max listings:</span>
                        <input
                          type="number"
                          className={cn(
                            "w-15 justify-self-end no-spinner rounded-md pl-1.5 pr-1 py-1.5 text-xs text-gs-4 border border-gs-3/50 focus:border-primary",
                            normalizedOptions.homeq?.maxListings != null && "border-primary",
                          )}
                          placeholder="∞"
                          value={normalizedOptions.homeq?.maxListings ?? ""}
                          onChange={(event) => handleHomeQMaxListingsChange(event.target.value)}
                          min={1}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
  const normalizedSearchOptions = normalizeSearchOptions(searchOptions);

  return (
    <div className="flex flex-wrap items-center gap-0">
      <Button
        size="large"
        onClick={() => onFetch(normalizedSearchOptions)}
        disabled={isFetching}
        className="rounded-r-none"
      >
        {isFetching ? (
          <FetchStatusBadge progress={progress} />
        ) : (
          <span className="text-base">{hasCachedData ? "Update data" : "Get data"}</span>
        )}
      </Button>
      <DataSettings searchOptions={normalizedSearchOptions} setSearchOptions={setSearchOptions} />
    </div>
  );
}
