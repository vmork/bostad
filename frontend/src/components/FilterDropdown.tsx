import type { Listing } from "../api/models";
import {
  resetFilter,
  type BooleanFilter,
  type Filter,
  type RangeFilter,
  type SetFilter,
} from "../lib/filterSort";
import { groupNames, keyConfig } from "../lib/keyConfig";
import { cn } from "../lib/utils";
import { Button } from "./generic/Button";
import { Dropdown } from "./generic/Dropdown";
import { Input } from "./generic/Input";
import { CheckIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { MultiSelect } from "./generic/MultiSelect";
import { Pill } from "./generic/Pill";

// Updates one filter in the array without mutating the original
function replaceFilter(
  filters: Filter<Listing>[],
  setFilters: (filters: Filter<Listing>[]) => void,
  updatedFilter: Filter<Listing>,
) {
  const newFilters = filters.map((filter) => {
    if (filter.id !== updatedFilter.id) return filter;

    switch (filter.type) {
      case "range":
        if (updatedFilter.type !== "range") return filter;
        return { ...updatedFilter, stats: filter.stats };
      case "set":
        if (updatedFilter.type !== "set") return filter;
        return { ...updatedFilter, stats: filter.stats };
      case "boolean":
        if (updatedFilter.type !== "boolean") return filter;
        return { ...updatedFilter, stats: filter.stats };
    }
  });

  setFilters(newFilters);
}

// Builds range/options info text with optional unit suffix and null count
function getFilterInfoString(filter: Filter<Listing>): string {
  const nullSuffix = filter.stats.nullCount > 0 ? ` (${filter.stats.nullCount} null)` : "";

  if (filter.type === "range") {
    if (!isFinite(filter.stats.absMin)) return "No data";
    const unit = filter.def.unit ? ` ${filter.def.unit}` : "";
    return `${filter.stats.absMin} to ${filter.stats.absMax}${unit}${nullSuffix}`;
  } else if (filter.type === "set") {
    if (filter.stats.allOptions.length === 0) return "No data";
    return `${filter.stats.allOptions.length} options${nullSuffix}`;
  } else if (filter.type === "boolean") {
    const totalCount = filter.stats.trueCount + filter.stats.falseCount + filter.stats.nullCount;
    return `${filter.stats.trueCount}/${totalCount}${nullSuffix}`;
  }

  return "No data";
}

// Auto-sizing number input that grows/shrinks with its content
function RangeInputField({
  filter,
  onFilterChange,
  boundType,
}: {
  filter: RangeFilter<Listing>;
  onFilterChange: (updatedFilter: RangeFilter<Listing>) => void;
  boundType: "min" | "max";
}) {
  const value = filter.state[boundType];
  const displayValue = value ?? "";
  const placeholder = boundType === "min" ? "-∞" : "+∞";
  // Size to content: use value length if present, otherwise placeholder length
  const charCount = String(displayValue).length || placeholder.length;
  const inputWidth = Math.max(charCount + 2, 5);

  return (
    <Input
      type="number"
      active={value != null}
      style={{ width: `${inputWidth}ch` }}
      min={isFinite(filter.stats.absMin) ? filter.stats.absMin : undefined}
      max={isFinite(filter.stats.absMax) ? filter.stats.absMax : undefined}
      step={filter.def.stepSize}
      value={displayValue}
      placeholder={placeholder}
      onChange={(event) => {
        const value = event.target.value ? parseFloat(event.target.value) : null;
        const otherLimit = boundType === "min" ? filter.state.max : filter.state.min;
        const enabled = value !== null || otherLimit !== null;
        onFilterChange({ ...filter, state: { ...filter.state, [boundType]: value, enabled } });
      }}
    />
  );
}

// Renders bound inputs with ≤/≥ indicators or a dash separator for double bounds
function RangeInputs({
  filter,
  onFilterChange,
}: {
  filter: RangeFilter<Listing>;
  onFilterChange: (updatedFilter: RangeFilter<Listing>) => void;
}) {
  if (filter.def.boundType === "lower") {
    return (
      <div className="flex items-center">
        <span className="text-s text-gs-3/70 select-none mr-1.5">≥</span>
        <RangeInputField filter={filter} boundType="min" onFilterChange={onFilterChange} />
      </div>
    );
  }
  if (filter.def.boundType === "upper") {
    return (
      <div className="flex items-center gap-0.5">
        <span className="text-s text-gs-3/70 select-none mr-1">≤</span>
        <RangeInputField filter={filter} boundType="max" onFilterChange={onFilterChange} />
      </div>
    );
  }
  // Both bounds
  return (
    <div className="flex items-center gap-0.5">
      <RangeInputField filter={filter} boundType="min" onFilterChange={onFilterChange} />
      <span className="text-s text-gs-3/70 select-none">-</span>
      <RangeInputField filter={filter} boundType="max" onFilterChange={onFilterChange} />
    </div>
  );
}

// Left side of each filter row: optional clear button + name + info text
function FilterRowLeftSide({
  filter,
  onFilterChange,
}: {
  filter: Filter<Listing>;
  onFilterChange: (updatedFilter: Filter<Listing>) => void;
}) {
  const iconClassName = "w-4 h-4 text-gs-3/70";
  return (
    <div className="flex items-center gap-1.5">
      {filter.state.enabled ? (
        <Button
          variant="icon"
          className="p-0 bg-transparent -ml-1.5"
          onClick={(event) => {
            event.stopPropagation();
            onFilterChange(resetFilter(filter));
          }}
        >
          <XIcon className={cn(iconClassName, "text-red-1/50 hover:brightness-50")} />
        </Button>
      ) : null}
      <div className="flex flex-col">
        <span className={cn("uppercase text-xs text-gs-4", filter.state.enabled && "font-medium")}>
          {filter.def.name}
        </span>
        <span className="text-xxs text-gs-3/70">{getFilterInfoString(filter)}</span>
      </div>
    </div>
  );
}

function RangeFilterRow({
  filter,
  onFilterChange,
}: {
  filter: RangeFilter<Listing>;
  onFilterChange: (updatedFilter: Filter<Listing>) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 justify-between w-full px-3 py-2 bg-gs-0",
        filter.state.enabled && "bg-gs-2/50",
      )}
    >
      <FilterRowLeftSide filter={filter} onFilterChange={onFilterChange} />
      <RangeInputs filter={filter} onFilterChange={onFilterChange} />
    </div>
  );
}

function SetFilterRow({
  filter,
  onFilterChange,
}: {
  filter: SetFilter<Listing>;
  onFilterChange: (updatedFilter: Filter<Listing>) => void;
}) {
  const numSelected = filter.state.included.length;
  const firstSelectedLabel =
    numSelected > 0
      ? (filter.def.getOptionLabel?.(filter.state.included[0]) ?? String(filter.state.included[0]))
      : null;

  return (
    <Dropdown.Submenu title={filter.def.name} preferredSide="right">
      <Dropdown.SubmenuTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-3 justify-between w-full cursor-pointer px-3 py-2 bg-gs-0 hover:brightness-95",
            filter.state.enabled && "bg-gs-2/50",
          )}
        >
          <FilterRowLeftSide filter={filter} onFilterChange={onFilterChange} />
          <div className="flex items-center gap-1">
            {numSelected > 0 && (
              <Pill type="primary" className="text-xs">
                {`${firstSelectedLabel}` + (numSelected > 1 ? ` + ${numSelected - 1}` : ``)}
              </Pill>
            )}
            <ChevronRightIcon className="h-4 w-4 shrink-0 text-gs-3/70" />
          </div>
        </div>
      </Dropdown.SubmenuTrigger>
      <Dropdown.SubmenuContent className="border border-gs-3/50 p-3 max-w-[min(20rem,calc(100vw-1.5rem))]">
        <MultiSelect
          allItems={filter.stats.allOptions}
          included={filter.state.included}
          setIncluded={(included) => {
            const nextIncluded = included ?? [];
            onFilterChange({
              ...filter,
              state: { ...filter.state, included: nextIncluded, enabled: nextIncluded.length > 0 },
            });
          }}
          keyFn={(option) => option}
          displayFn={(option) => {
            const label = filter.def.getOptionLabel?.(option) ?? String(option);
            return `${label} (${filter.stats.optionCounts.get(option) ?? 0})`;
          }}
        />
      </Dropdown.SubmenuContent>
    </Dropdown.Submenu>
  );
}

// Custom checkbox that matches the design system
function Checkbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "w-4 h-4 rounded border flex items-center justify-center cursor-pointer shrink-0 transition-colors",
        checked
          ? "bg-primary border-primary text-white"
          : "border-gs-3/50 bg-gs-0 hover:border-gs-3",
      )}
    >
      {checked && <CheckIcon className="w-3 h-3" strokeWidth={3} />}
    </button>
  );
}

// Checkbox row for boolean feature filters, with optional "allow null" toggle
function BooleanFilterRow({
  filter,
  onFilterChange,
}: {
  filter: BooleanFilter<Listing>;
  onFilterChange: (updatedFilter: Filter<Listing>) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 justify-between w-full px-3 py-2 bg-gs-0",
        filter.state.enabled && "bg-gs-2/50",
      )}
    >
      <FilterRowLeftSide filter={filter} onFilterChange={onFilterChange} />
      <div className="flex items-center gap-2">
        {/* "include unknown" toggle — only visible when filter is active and nulls exist */}
        {filter.state.enabled && filter.stats.nullCount > 0 && (
          <button
            type="button"
            className={cn(
              "text-xs rounded px-1.5 py-0.5 border cursor-pointer",
              filter.state.allowNull
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-gs-3/30 text-gs-3/70 hover:border-gs-3/60",
            )}
            onClick={() =>
              onFilterChange({
                ...filter,
                state: { ...filter.state, allowNull: !filter.state.allowNull },
              })
            }
          >
            incl. null
          </button>
        )}
        <Checkbox
          checked={filter.state.enabled}
          onChange={(checked) =>
            onFilterChange({
              ...filter,
              state: {
                ...filter.state,
                enabled: checked,
                value: checked ? filter.state.value : true,
              },
            })
          }
        />
      </div>
    </div>
  );
}

// Groups filters by their group field, preserving order within each group.
// Filters with showInFilter === false in keyConfig are excluded.
function groupFilters(filters: Filter<Listing>[]) {
  const groups: { group: string; label: string; filters: Filter<Listing>[] }[] = [];
  const groupMap = new Map<string, Filter<Listing>[]>();

  for (const filter of filters) {
    const config = keyConfig[filter.id];
    if (config?.showInFilter === false) continue;

    const groupId = filter.def.group ?? "";
    if (!groupMap.has(groupId)) {
      const label = (groupNames as Record<string, string>)[groupId] ?? "";
      const entry = { group: groupId, label, filters: [] as Filter<Listing>[] };
      groups.push(entry);
      groupMap.set(groupId, entry.filters);
    }
    groupMap.get(groupId)!.push(filter);
  }
  return groups;
}

// ----- Main FilterDropdown -----

export function FilterDropdown({
  filters,
  displayFilters,
  setFilters,
  onOpenChange,
}: {
  filters: Filter<Listing>[];
  displayFilters?: Filter<Listing>[];
  setFilters: (filters: Filter<Listing>[]) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const renderedFilters = displayFilters ?? filters;
  const activeCount = filters.filter(
    (f) => f.state.enabled && keyConfig[f.id]?.showInFilter !== false,
  ).length;
  const groups = groupFilters(renderedFilters);

  const clearAllFilters = () => {
    setFilters(filters.map((f) => resetFilter(f)));
  };

  return (
    <div className="flex items-center gap-0">
      <Dropdown.Root triggerMode="hover" mobileModalTitle="Filters" onOpenChange={onOpenChange}>
        <Dropdown.Trigger>
          <Button
            size="large"
            className={cn(
              activeCount > 0 && "border-primary/60 bg-primary/10 text-primary rounded-r-none",
            )}
          >
            Filters{activeCount > 0 ? ` (${activeCount})` : ""}
          </Button>
        </Dropdown.Trigger>
        <Dropdown.Content className="border border-gs-3/50 min-w-88 max-w-[min(28rem,calc(100vw-1.5rem))]">
          <div className="py-2 flex flex-col">
            {groups.map((group) => (
              <div key={group.group}>
                {/* Group header */}
                <div className="mt-2 mb-2 p-1 italic pb-0 text-xxs text-gs-4 border-b border-gs-4">
                  {group.label}
                </div>
                {/* Filter rows within the group */}
                <div className="flex flex-col divide-y divide-gs-2">
                  {group.filters.map((filter) => (
                    <div key={filter.id}>
                      {filter.type === "range" ? (
                        <RangeFilterRow
                          filter={filter}
                          onFilterChange={(updatedFilter) =>
                            replaceFilter(filters, setFilters, updatedFilter)
                          }
                        />
                      ) : filter.type === "boolean" ? (
                        <BooleanFilterRow
                          filter={filter}
                          onFilterChange={(updatedFilter) =>
                            replaceFilter(filters, setFilters, updatedFilter)
                          }
                        />
                      ) : (
                        <SetFilterRow
                          filter={filter}
                          onFilterChange={(updatedFilter) =>
                            replaceFilter(filters, setFilters, updatedFilter)
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Dropdown.Content>
      </Dropdown.Root>
      {activeCount > 0 && (
        <Button
          variant="dark"
          size="large"
          className="rounded-l-none border-l-0"
          onClick={clearAllFilters}
        >
          <span className="text-xs">Reset</span>
        </Button>
      )}
    </div>
  );
}
