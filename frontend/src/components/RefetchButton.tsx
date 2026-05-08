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
import { Input } from "./generic/Input";

const defaultSearchOptions: ListingsStreamOptions = {
  sources: DEFAULT_LISTING_SOURCES,
  bostadsthlm: {},
  homeq: {},
};

type SourceId = (typeof ListingSources)[keyof typeof ListingSources];

type SourceOptionField = {
  id: string;
  label: string;
  type: "text" | "number";
  placeholder: string;
  min?: number;
  inputClassName?: string;
  value: string | number | undefined | null;
  onChange: (value: string) => void;
};

type SourceOptionSection = {
  id: SourceId;
  fields: SourceOptionField[];
};

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

  const toggleSource = (source: SourceId) => {
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

  const selectedSources = normalizedOptions.sources ?? [];
  // Declarative field configs keep the dropdown easy to extend without duplicating JSX.
  const sourceOptionSections: SourceOptionSection[] = [
    {
      id: ListingSources.bostadsthlm,
      fields: [
        {
          id: "cookie",
          label: "Cookie",
          type: "text",
          placeholder: "Enter cookie",
          inputClassName: "w-full",
          value: normalizedOptions.bostadsthlm?.cookie,
          onChange: (value) => updateBostadOptions({ cookie: value || undefined }),
        },
        {
          id: "max-listings",
          label: "Max listings",
          type: "number",
          placeholder: "∞",
          min: 1,
          inputClassName: "w-15 justify-self-end",
          value: normalizedOptions.bostadsthlm?.maxListings,
          onChange: (value) => updateBostadOptions({ maxListings: value ? parseInt(value, 10) : undefined }),
        },
      ],
    },
    {
      id: ListingSources.homeq,
      fields: [
        {
          id: "max-listings",
          label: "Max listings",
          type: "number",
          placeholder: "∞",
          min: 1,
          inputClassName: "w-15 justify-self-end",
          value: normalizedOptions.homeq?.maxListings,
          onChange: (value) => updateHomeQOptions({ maxListings: value ? parseInt(value, 10) : undefined }),
        },
      ],
    },
  ];

  return (
    <Dropdown.Root triggerMode="hover" preferredSide="bottom" mobileBreakpoint={768} gap={5}>
      <Dropdown.Trigger asChild>
        <Button size="large" variant="dark" className={cn("w-fit rounded-l-none border-l-0")}>
          <SettingsIcon size={15} />
          <span className="mx-1 text-xs">Options</span>
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
                  <Checkbox checked={enabled} onChange={() => toggleSource(section.id)} />
                  <a
                    className="min-w-0 text-xs font-medium uppercase tracking-wide text-gs-4 hover:text-primary hover:underline"
                    href={metadata.globalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {metadata.name}
                  </a>
                </div>

                <div className="space-y-2 border-t border-gs-2/80 px-3 py-3">
                  <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
                    {section.fields.map((field) => (
                      <div key={`${section.id}-${field.id}`} className="contents">
                        <span className="text-xs uppercase text-gs-4">{field.label}:</span>
                        <Input
                          type={field.type}
                          className={field.inputClassName}
                          active={field.value != null && field.value !== ""}
                          placeholder={field.placeholder}
                          value={field.value ?? ""}
                          onChange={(event) => field.onChange(event.target.value)}
                          min={field.min}
                        />
                      </div>
                    ))}
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
