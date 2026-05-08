import type { Listing, ListingSources } from "../api/models";
import {
  createBooleanFilter,
  createRangeFilter,
  createSetFilter,
  type Filter,
  type FilterDef,
  type FilterState,
  type KeyFn,
  type SortEntry,
} from "./filterSort";
import { sourceMetadataById } from "./sourceMetadata";

type FilterGroups = "location" | "info" | "queuePosition" | "requirements" | "features";

// Human-readable names for each filter group
export const groupNames: Record<FilterGroups, string> = {
  location: "Location",
  info: "Basic Info",
  queuePosition: "Queue Position",
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

export type SerializedSortEntry = {
  id: string;
  ascending: boolean;
};

// Date-derived filters use day precision for filtering but timestamp ordering for stable sorting.
function toTimestamp(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
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
    defaultState: { allowNull: false },
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
    defaultState: { allowNull: true },
    group: "info",
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

  // --- Queue position
  queuePosition: {
    type: "range",
    id: "queuePosition",
    name: "Queue position",
    key: (ls) => ls.queuePosition?.myPosition ?? null,
    boundType: "both",
    stepSize: 1,
    group: "queuePosition",
  },
  totalApplicants: {
    type: "range",
    id: "totalApplicants",
    name: "Total applicants",
    key: (ls) => ls.queuePosition?.total ?? null,
    boundType: "both",
    stepSize: 1,
    group: "queuePosition",
  },
  longestQueueTimeDays: {
    type: "range",
    id: "longestQueueTimeDays",
    name: "Longest queue time",
    unit: "days",
    key: (ls) => daysSince(ls.queuePosition?.oldestQueueDates?.[0] ?? null),
    sortKey: (ls) => descendingTimestamp(ls.queuePosition?.oldestQueueDates?.[0] ?? null),
    boundType: "both",
    stepSize: 1,
    group: "queuePosition",
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
    defaultState: { allowNull: true }, // missing likely implies no limit
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
    defaultState: { allowNull: true }, // missing likely implies no limit
    group: "requirements",
  },
  ageMin: {
    type: "range",
    id: "ageMin",
    name: "Min age limit",
    key: (ls) => ls.requirements?.ageRange?.min ?? null,
    boundType: "upper",
    stepSize: 1,
    defaultState: { allowNull: true },
    group: "requirements",
  },
  ageMax: {
    type: "range",
    id: "ageMax",
    name: "Max age limit",
    key: (ls) => ls.requirements?.ageRange?.max ?? null,
    boundType: "lower",
    stepSize: 1,
    defaultState: { allowNull: true },
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

export function buildSortEntries(): SortEntry<Listing>[] {
  return Object.values(keyConfig)
    .filter((def) => def.showInSort !== false)
    .map((def) => ({
      id: def.id,
      name: def.name,
      key: def.sortKey ?? def.key,
      ascending: true,
    }));
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

// Extract sort order and directions for local storage.
export function serializeSortEntries(entries: SortEntry<Listing>[]): SerializedSortEntry[] {
  return entries.map((entry) => ({ id: entry.id, ascending: entry.ascending }));
}

// Restore persisted sort order while ignoring removed keys and appending new ones.
export function hydrateSortEntries(states: SerializedSortEntry[]): SortEntry<Listing>[] {
  const defaultEntries = buildSortEntries();
  const entriesById = new Map(defaultEntries.map((entry) => [entry.id, entry] as const));
  const usedIds = new Set<string>();
  const hydratedEntries: SortEntry<Listing>[] = [];

  for (const state of states) {
    const entry = entriesById.get(state.id);
    if (!entry || usedIds.has(state.id)) continue;
    hydratedEntries.push({ ...entry, ascending: state.ascending });
    usedIds.add(state.id);
  }

  for (const entry of defaultEntries) {
    if (usedIds.has(entry.id)) continue;
    hydratedEntries.push(entry);
  }

  return hydratedEntries;
}
