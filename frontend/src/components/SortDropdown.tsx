import { ArrowUpIcon, ArrowDownIcon } from "lucide-react";

import type { Listing } from "../api/models";
import type { ActiveSort, SortOption } from "../lib/filterSort";
import { cn } from "../lib/utils";
import { Button } from "./generic/Button";
import { Dropdown } from "./generic/Dropdown";

function SortRow({
  option,
  selectedSort,
  onSelect,
  onToggleDirection,
}: {
  option: SortOption<Listing>;
  selectedSort: ActiveSort<Listing>;
  onSelect: (option: SortOption<Listing>) => void;
  onToggleDirection: (option: SortOption<Listing>, ascending: boolean) => void;
}) {
  const dirBtnBase = "flex items-center justify-center w-6 h-6 rounded-md border cursor-pointer";
  const dirBtnActive = "border-primary/50 bg-primary/10 text-primary";
  const dirBtnInactive = "border-gs-3/30 text-gs-3/50 hover:border-gs-3/60";
  const isSelected = selectedSort.id === option.id;

  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-gs-0">
      <label className="flex items-center gap-2 min-w-0 cursor-pointer">
        <input
          type="radio"
          name="listings-sort"
          className="sr-only"
          checked={isSelected}
          onChange={() => onSelect(option)}
        />
        <span
          aria-hidden="true"
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
            isSelected ? "border-primary/50" : "border-gs-3/40",
          )}
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full bg-primary transition-opacity",
              isSelected ? "opacity-100" : "opacity-0",
            )}
          />
        </span>
        <span className="uppercase text-xs text-gs-4 truncate">{option.name}</span>
      </label>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          className={cn(
            dirBtnBase,
            isSelected && selectedSort.ascending ? dirBtnActive : dirBtnInactive,
          )}
          onClick={() => onToggleDirection(option, true)}
          aria-label={`Sort ${option.name} ascending`}
        >
          <ArrowUpIcon className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          className={cn(
            dirBtnBase,
            isSelected && !selectedSort.ascending ? dirBtnActive : dirBtnInactive,
          )}
          onClick={() => onToggleDirection(option, false)}
          aria-label={`Sort ${option.name} descending`}
        >
          <ArrowDownIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ----- Main SortDropdown -----

export function SortDropdown({
  sortOptions,
  selectedSort,
  setSelectedSort,
}: {
  sortOptions: SortOption<Listing>[];
  selectedSort: ActiveSort<Listing>;
  setSelectedSort: (sort: ActiveSort<Listing>) => void;
}) {
  const handleSelect = (option: SortOption<Listing>) => {
    if (option.id === selectedSort.id) {
      return;
    }

    setSelectedSort({
      ...option,
      ascending: true,
    });
  };

  const handleToggleDirection = (option: SortOption<Listing>, ascending: boolean) => {
    setSelectedSort({ ...option, ascending });
  };
  const triggerLabel = `${selectedSort.name} ${selectedSort.ascending ? "↑" : "↓"}`;

  return (
    <div className="flex items-center">
      <Dropdown.Root triggerMode="hover" mobileModalTitle="Sort">
        <Dropdown.Trigger>
          <Button size="large" className="[word-spacing:-5px]">
            Sort ({triggerLabel})
          </Button>
        </Dropdown.Trigger>
        <Dropdown.Content className="border border-gs-3/50 min-w-64 max-w-[min(22rem,calc(100vw-1.5rem))]">
          <div
            className="py-1 flex flex-col divide-y divide-gs-2"
            role="radiogroup"
            aria-label="Sort listings"
          >
            {sortOptions.map((option) => (
              <SortRow
                key={option.id}
                option={option}
                selectedSort={selectedSort}
                onSelect={handleSelect}
                onToggleDirection={handleToggleDirection}
              />
            ))}
          </div>
        </Dropdown.Content>
      </Dropdown.Root>
    </div>
  );
}
