import type {
  AllocationMethod,
  Listing,
  ListingFurnishing,
  ListingSources,
  ListingTenureType,
} from "../api/models";
import {
  createBooleanFilter,
  createRangeFilter,
  createSetFilter,
  type ActiveSort,
  type Filter,
  type FilterDef,
  type FilterState,
  type KeyFn,
  type SortOption,
} from "./filterSort";
import { sourceMetadataById } from "./sourceMetadata";
import {
  formatAllocationMethodLabel,
  formatFurnishingLabel,
  formatTenureTypeLabel,
  toDateTimestamp,
} from "./utils";

type FilterGroups = "location" | "info" | "timing" | "allocationInfo" | "requirements" | "features";

// Human-readable names for each filter group
export const groupNames: Record<FilterGroups, string> = {
  location: "Location",
  info: "Basic Info",
  timing: "Timing",
  allocationInfo: "Allocation",
  requirements: "Requirements",
  features: "Features",
};

type ListingsKeyConfigEntry = FilterDef<Listing> & {
  group: FilterGroups;
  sortKey?: KeyFn<Listing, any>;
  showInSort?: boolean;
  showInFilter?: boolean; // false to hide from FilterDropdown (e.g. map filter has its own UI)
};

export type SerializedFilterState = { id: string } & FilterState;

export type SerializedSortState = {
  id: string;
  ascending: boolean;
};

// Date-derived filters use day precision for filtering but timestamp ordering for stable sorting.
function toTimestamp(value: Date | string | null | undefined) {
  return toDateTimestamp(value);
}

function daysSince(value: Date | string | null | undefined) {
  const timestamp = toTimestamp(value);
  if (timestamp == null) return null;
  return Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
}

function descendingTimestamp(value: Date | string | null | undefined) {
  const timestamp = toTimestamp(value);
  if (timestamp == null) return null;
  return -timestamp;
}

function daysUntil(value: Date | string | null | undefined) {
  const timestamp = toTimestamp(value);
  if (timestamp == null) return null;
  return Math.floor((timestamp - Date.now()) / (1000 * 60 * 60 * 24));
}

function clampNonNegative(value: number | null) {
  if (value == null) return null;
  return Math.max(0, value);
}

function leaseStartDays(value: Listing["leaseStartDate"]) {
  if (value === "asap") return 0;
  return clampNonNegative(daysUntil(value));
}

function leaseStartSortValue(value: Listing["leaseStartDate"]) {
  if (value === "asap") return Number.NEGATIVE_INFINITY;
  return toTimestamp(value);
}

function leaseEndDays(value: Listing["leaseEndDate"]) {
  return clampNonNegative(daysUntil(value));
}

export const keyConfig: Record<string, ListingsKeyConfigEntry> = {
  // --- Location (managed by map modal, hidden from FilterDropdown)
  districtId: {
    type: "set",
    id: "districtId",
    name: "District",
    key: "districtId",
    group: "location",
    showInSort: false,
    showInFilter: false,
  },

  // --- Basic info
  rent: {
    type: "range",
    id: "rent",
    name: "Rent",
    unit: "kr",
    key: "rent",
    boundType: "both",
    stepSize: 1,
    group: "info",
  },
  apartmentType: {
    type: "set",
    id: "apartmentType",
    name: "Apartment type",
    key: "apartmentType",
    group: "info",
    showInSort: false,
  },
  tenureType: {
    type: "set",
    id: "tenureType",
    name: "Tenure type",
    key: (ls) => ls.tenureType ?? null,
    getOptionLabel: (value: ListingTenureType) => formatTenureTypeLabel(value) ?? String(value),
    group: "info",
    showInSort: false,
  },
  areaSqm: {
    type: "range",
    id: "areaSqm",
    name: "Area",
    unit: "m²",
    key: "areaSqm",
    boundType: "both",
    stepSize: 1,
    group: "info",
  },
  numRooms: {
    type: "range",
    id: "numRooms",
    name: "Rooms",
    key: "numRooms",
    boundType: "both",
    stepSize: 1,
    group: "info",
  },
  floor: {
    type: "range",
    id: "floor",
    name: "Floor",
    key: "floor",
    boundType: "both",
    stepSize: 1,
    group: "info",
  },
  numApartments: {
    type: "range",
    id: "numApartments",
    name: "Number of apts",
    key: "numApartments",
    boundType: "both",
    stepSize: 1,
    group: "info",
  },
  furnishing: {
    type: "set",
    id: "furnishing",
    name: "Furnishing",
    key: (ls) => ls.furnishing ?? null,
    getOptionLabel: (value: ListingFurnishing) => formatFurnishingLabel(value) ?? String(value),
    group: "info",
    showInSort: false,
  },
  source: {
    type: "set",
    id: "source",
    name: "Source",
    key: "source",
    getOptionLabel: (source: ListingSources) => sourceMetadataById[source]?.name ?? source,
    group: "info",
    showInSort: false,
  },

  // --- Timing
  leaseStartDays: {
    type: "range",
    id: "leaseStartDays",
    name: "Lease start in",
    unit: "days",
    key: (ls) => leaseStartDays(ls.leaseStartDate),
    sortKey: (ls) => leaseStartSortValue(ls.leaseStartDate),
    boundType: "both",
    stepSize: 1,
    group: "timing",
  },
  leaseEndDays: {
    type: "range",
    id: "leaseEndDays",
    name: "Lease end in",
    unit: "days",
    key: (ls) => leaseEndDays(ls.leaseEndDate),
    sortKey: (ls) => toTimestamp(ls.leaseEndDate),
    boundType: "both",
    stepSize: 1,
    group: "timing",
  },
  postAgeDays: {
    type: "range",
    id: "postAgeDays",
    name: "Post age",
    unit: "days",
    key: (ls) => daysSince(ls.datePosted),
    // Preserve age ordering while avoiding Date.now drift during sorting.
    sortKey: (ls) => descendingTimestamp(ls.datePosted),
    boundType: "upper",
    stepSize: 1,
    group: "timing",
  },
  applicationDeadlineDays: {
    type: "range",
    id: "applicationDeadlineDays",
    name: "Application deadline",
    unit: "days",
    key: (ls) => daysUntil(ls.applicationDeadlineDate),
    sortKey: (ls) => toTimestamp(ls.applicationDeadlineDate),
    boundType: "upper",
    stepSize: 1,
    group: "timing",
  },

  // --- Queue position
  allocationMethod: {
    type: "set",
    id: "allocationMethod",
    name: "Allocation method",
    key: (ls) => ls.allocationInfo?.allocationMethod ?? null,
    getOptionLabel: (value: AllocationMethod) => formatAllocationMethodLabel(value) ?? value,
    group: "allocationInfo",
    showInSort: false,
  },
  allocationInfo: {
    type: "range",
    id: "allocationInfo",
    name: "Queue position",
    key: (ls) => ls.allocationInfo?.myPosition ?? null,
    boundType: "both",
    stepSize: 1,
    group: "allocationInfo",
  },
  totalApplicants: {
    type: "range",
    id: "totalApplicants",
    name: "Total applicants",
    key: (ls) => ls.allocationInfo?.total ?? null,
    boundType: "both",
    stepSize: 1,
    group: "allocationInfo",
  },
  longestQueueTimeDays: {
    type: "range",
    id: "longestQueueTimeDays",
    name: "Longest queue time",
    unit: "days",
    key: (ls) => daysSince(ls.allocationInfo?.oldestQueueDates?.[0] ?? null),
    sortKey: (ls) => descendingTimestamp(ls.allocationInfo?.oldestQueueDates?.[0] ?? null),
    boundType: "both",
    stepSize: 1,
    group: "allocationInfo",
  },

  // --- Requirements
  incomeMin: {
    type: "range",
    id: "incomeMin",
    name: "Min income limit",
    unit: "kr",
    key: (ls) => ls.requirements?.incomeRange?.min ?? null,
    boundType: "upper",
    stepSize: 1,
    group: "requirements",
  },
  incomeMax: {
    type: "range",
    id: "incomeMax",
    name: "Max income limit",
    unit: "kr",
    key: (ls) => ls.requirements?.incomeRange?.max ?? null,
    boundType: "lower",
    stepSize: 1,
    group: "requirements",
  },
  ageMin: {
    type: "range",
    id: "ageMin",
    name: "Min age limit",
    key: (ls) => ls.requirements?.ageRange?.min ?? null,
    boundType: "upper",
    stepSize: 1,
    group: "requirements",
  },
  ageMax: {
    type: "range",
    id: "ageMax",
    name: "Max age limit",
    key: (ls) => ls.requirements?.ageRange?.max ?? null,
    boundType: "lower",
    stepSize: 1,
    group: "requirements",
  },

  // --- Features
  balcony: {
    type: "boolean",
    id: "balcony",
    name: "Balcony",
    key: (ls) => ls.features?.balcony ?? null,
    group: "features",
    showInSort: false,
  },
  elevator: {
    type: "boolean",
    id: "elevator",
    name: "Elevator",
    key: (ls) => ls.features?.elevator ?? null,
    group: "features",
    showInSort: false,
  },
  newProduction: {
    type: "boolean",
    id: "newProduction",
    name: "New production",
    key: (ls) => ls.features?.newProduction ?? null,
    group: "features",
    showInSort: false,
  },
  kitchen: {
    type: "boolean",
    id: "kitchen",
    name: "Kitchen",
    key: (ls) => ls.features?.kitchen ?? null,
    group: "features",
    showInSort: false,
  },
  bathroom: {
    type: "boolean",
    id: "bathroom",
    name: "Bathroom",
    key: (ls) => ls.features?.bathroom ?? null,
    group: "features",
    showInSort: false,
  },
  dishwasher: {
    type: "boolean",
    id: "dishwasher",
    name: "Dishwasher",
    key: (ls) => ls.features?.dishwasher ?? null,
    group: "features",
    showInSort: false,
  },
  washingMachine: {
    type: "boolean",
    id: "washingMachine",
    name: "Washing machine",
    key: (ls) => ls.features?.washingMachine ?? null,
    group: "features",
    showInSort: false,
  },
  dryer: {
    type: "boolean",
    id: "dryer",
    name: "Dryer",
    key: (ls) => ls.features?.dryer ?? null,
    group: "features",
    showInSort: false,
  },
  hasViewing: {
    type: "boolean",
    id: "hasViewing",
    name: "Has viewing",
    key: (ls) => ls.features?.hasViewing ?? null,
    group: "features",
    showInSort: false,
  },
  hasPictures: {
    type: "boolean",
    id: "hasPictures",
    name: "Has pictures",
    key: (ls) => ls.features?.hasPictures ?? null,
    group: "features",
    showInSort: false,
  },
  hasFloorplan: {
    type: "boolean",
    id: "hasFloorplan",
    name: "Has floorplan",
    key: (ls) => ls.features?.hasFloorplan ?? null,
    group: "features",
    showInSort: false,
  },
} as const;

// Build fresh filter instances from the immutable definitions and current data.
export function buildFilters(data: Listing[]): Filter<Listing>[] {
  return Object.values(keyConfig).map((def) => {
    switch (def.type) {
      case "range":
        return createRangeFilter(def, data);
      case "set":
        return createSetFilter(def, data);
      case "boolean":
        return createBooleanFilter(def, data);
    }
  });
}

// Extract just the serializable parts of each filter for local storage.
export function serializeFilters(filters: Filter<Listing>[]): SerializedFilterState[] {
  return filters.map((filter) => ({ id: filter.id, ...filter.state }));
}

// Rebuild a filter from serialized state by reattaching the matching definition and stats.
export function hydrateFilter(
  state: { id: string } & FilterState,
  data: Listing[],
): Filter<Listing> | null {
  const def = keyConfig[state.id];
  if (!def) return null;
  switch (def.type) {
    case "range":
      return createRangeFilter(def, data, state);
    case "set":
      return createSetFilter(def, data, state);
    case "boolean":
      return createBooleanFilter(def, data, state);
  }
}

// Recompute filter stats from fresh data while preserving the user's current selections.
export function syncFiltersWithData(
  filters: Filter<Listing>[],
  data: Listing[],
): Filter<Listing>[] {
  const nextFilters = filters
    .map((filter) => hydrateFilter({ id: filter.id, ...filter.state }, data))
    .filter((filter): filter is Filter<Listing> => filter !== null);

  return nextFilters.length > 0 ? nextFilters : buildFilters(data);
}

// Restore persisted filter state while keeping config order and filling in new filters.
export function hydrateFilters(
  states: SerializedFilterState[],
  data: Listing[],
): Filter<Listing>[] {
  const filtersById = new Map(
    states
      .map((state) => hydrateFilter(state, data))
      .filter((filter): filter is Filter<Listing> => filter !== null)
      .map((filter) => [filter.id, filter] as const),
  );

  return Object.values(keyConfig).map((def) => filtersById.get(def.id) ?? buildFilter(def, data));
}

export function buildSortOptions(): SortOption<Listing>[] {
  return Object.values(keyConfig)
    .filter((def) => def.showInSort !== false)
    .map((def) => ({
      id: def.id,
      name: def.name,
      key: def.sortKey ?? def.key,
    }));
}

export function buildDefaultSort(): ActiveSort<Listing> {
  const [defaultSort] = buildSortOptions();

  if (!defaultSort) {
    throw new Error("Expected at least one sortable listing field");
  }

  return {
    ...defaultSort,
    ascending: true,
  };
}

function buildFilter(def: ListingsKeyConfigEntry, data: Listing[]): Filter<Listing> {
  switch (def.type) {
    case "range":
      return createRangeFilter(def, data);
    case "set":
      return createSetFilter(def, data);
    case "boolean":
      return createBooleanFilter(def, data);
  }
}

// Extract the selected sort and direction for local storage.
export function serializeSortState(sort: ActiveSort<Listing>): SerializedSortState {
  return { id: sort.id, ascending: sort.ascending };
}

// Restore persisted sort state while supporting the previous array-based multi-sort shape.
export function hydrateSortState(
  state: SerializedSortState | SerializedSortState[] | null | undefined,
): ActiveSort<Listing> {
  const defaultSort = buildDefaultSort();
  const optionsById = new Map(buildSortOptions().map((option) => [option.id, option] as const));
  const candidate = Array.isArray(state)
    ? state.find((entry) => optionsById.has(entry.id))
    : state && optionsById.has(state.id)
      ? state
      : null;

  if (!candidate) {
    return defaultSort;
  }

  return {
    ...optionsById.get(candidate.id)!,
    ascending: candidate.ascending,
  };
}
