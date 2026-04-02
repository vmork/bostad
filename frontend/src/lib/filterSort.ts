// ---- Key accessor helpers ----

export type KeyFn<T, V = any> = ((t: T) => V) | keyof T;

export function keyLookup<T, V>(x: T, key: KeyFn<T, V>): V {
  return typeof key === "function" ? key(x) : (x[key] as V);
}

// ---- Filter definitions (immutable config, not serializable due to key functions) ----

export type RangeFilterDef<T> = {
  type: "range";
  id: string;
  name: string;
  key: KeyFn<T, number | null>;
  boundType: "upper" | "lower" | "both";
  stepSize: number;
  unit?: string;
  group?: string;
  defaultState?: Partial<RangeFilterState>;
};

export type SetFilterDef<T, V = any> = {
  type: "set";
  id: string;
  name: string;
  key: KeyFn<T, V>;
  group?: string;
  defaultState?: Partial<SetFilterState<V>>;
};

export type BooleanFilterDef<T> = {
  type: "boolean";
  id: string;
  name: string;
  key: KeyFn<T, boolean | null | undefined>;
  group?: string;
  defaultState?: Partial<BooleanFilterState>;
};

// ---- Filter state (user-mutable selections, serializable) ----

export type RangeFilterState = {
  enabled: boolean;
  min: number | null; // null treated as -inf
  max: number | null; // null treated as +inf
  allowNull: boolean; // if true, null data values pass the filter
};

export type SetFilterState<V = any> = {
  enabled: boolean;
  included: V[]; // empty = include all (filter disabled by convention)
  allowNull: boolean; // if true, null data values pass the filter
};

export type BooleanFilterState = {
  enabled: boolean;
  value: boolean; // true = require true, false = require false
  allowNull: boolean; // if true, null/undefined values pass (count as true)
};

// ---- Filter statistics (derived from data, recomputed on data change) ----

export type RangeFilterStats = {
  absMin: number; // Infinity when no non-null values exist
  absMax: number; // -Infinity when no non-null values exist
  nullCount: number;
};

export type SetFilterStats<V = any> = {
  allOptions: V[];
  nullCount: number;
};

export type BooleanFilterStats = {
  trueCount: number;
  falseCount: number;
  nullCount: number;
};

// ---- Assembled filter types (def + state + stats) ----

export type RangeFilter<T> = {
  type: "range";
  id: string;
  def: RangeFilterDef<T>;
  state: RangeFilterState;
  stats: RangeFilterStats;
};

export type SetFilter<T, V = any> = {
  type: "set";
  id: string;
  def: SetFilterDef<T, V>;
  state: SetFilterState<V>;
  stats: SetFilterStats<V>;
};

export type BooleanFilter<T> = {
  type: "boolean";
  id: string;
  def: BooleanFilterDef<T>;
  state: BooleanFilterState;
  stats: BooleanFilterStats;
};

export type Filter<T> = RangeFilter<T> | SetFilter<T> | BooleanFilter<T>;

export type FilterDef<T> = RangeFilterDef<T> | SetFilterDef<T> | BooleanFilterDef<T>;

export type FilterState = RangeFilterState | SetFilterState | BooleanFilterState;

// Reset a filter back to its disabled baseline while preserving configured defaults.
export function resetFilter<T>(filter: Filter<T>): Filter<T> {
  switch (filter.type) {
    case "range":
      return {
        ...filter,
        state: {
          enabled: false,
          min: null,
          max: null,
          allowNull: false,
          ...filter.def.defaultState,
        },
      };
    case "set":
      return {
        ...filter,
        state: {
          enabled: false,
          included: [],
          allowNull: false,
          ...filter.def.defaultState,
        },
      };
    case "boolean":
      return {
        ...filter,
        state: {
          enabled: false,
          value: true,
          allowNull: false,
          ...filter.def.defaultState,
        },
      };
  }
}

// ---- Filtering logic ----

function _filterItemByRange<T>(x: T, filter: RangeFilter<T>) {
  const value = keyLookup(x, filter.def.key);
  if (value == null) return filter.state.allowNull;
  const min = filter.def.boundType === "upper" ? -Infinity : (filter.state.min ?? -Infinity);
  const max = filter.def.boundType === "lower" ? Infinity : (filter.state.max ?? Infinity);
  return min <= value && value <= max;
}

function _filterItemBySet<T, V>(x: T, filter: SetFilter<T, V>) {
  const value = keyLookup(x, filter.def.key);
  if (value == null) return filter.state.allowNull;
  if (filter.state.included.length === 0) return true;
  return filter.state.included.includes(value as V);
}

function _filterItemByBoolean<T>(x: T, filter: BooleanFilter<T>) {
  const value = keyLookup(x, filter.def.key);
  if (value == null) return filter.state.allowNull;
  return value === filter.state.value;
}

export function applyFiltersToList<T>(xs: T[], filters: Filter<T>[]) {
  return xs.filter((x) => {
    return filters.every((filter) => {
      if (!filter.state.enabled) return true;
      switch (filter.type) {
        case "range":
          return _filterItemByRange(x, filter);
        case "set":
          return _filterItemBySet(x, filter);
        case "boolean":
          return _filterItemByBoolean(x, filter);
      }
    });
  });
}

// ---- Sorting ----

export type SortEntry<T, V = any> = {
  id: string;
  name: string;
  key: KeyFn<T, V>;
  ascending: boolean;
  cmpFunc?: (a: V, b: V) => number;
};

function defaultSortCmp<V>(left: V, right: V) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sortList<T, V = any>(xs: T[], sorts: SortEntry<T, V>[]) {
  // Precompute sort keys once so time-based accessors stay stable for the full sort pass.
  const decorated = xs.map((item, originalIndex) => ({
    item,
    originalIndex,
    values: sorts.map((sort) => keyLookup(item, sort.key)),
  }));

  decorated.sort((left, right) => {
    for (const [index, { ascending, cmpFunc }] of sorts.entries()) {
      const cmp = (cmpFunc ?? defaultSortCmp)(left.values[index], right.values[index]);
      if (cmp !== 0) return ascending ? cmp : -cmp;
    }
    return left.originalIndex - right.originalIndex;
  });

  return decorated.map(({ item }) => item);
}

// ---- Statistics computation ----

function _computeRangeStats<T>(def: RangeFilterDef<T>, data: T[]): RangeFilterStats {
  let absMin = Infinity;
  let absMax = -Infinity;
  let nullCount = 0;
  for (const obj of data) {
    const value = keyLookup(obj, def.key);
    if (value == null) {
      nullCount++;
      continue;
    }
    if (value < absMin) absMin = value;
    if (value > absMax) absMax = value;
  }
  return { absMin, absMax, nullCount };
}

function _computeSetStats<T, V>(def: SetFilterDef<T, V>, data: T[]): SetFilterStats<V> {
  const allOptions: V[] = [];
  let nullCount = 0;
  for (const obj of data) {
    const value = keyLookup(obj, def.key);
    if (value == null) {
      nullCount++;
      continue;
    }
    if (!allOptions.includes(value as V)) allOptions.push(value as V);
  }
  return { allOptions, nullCount };
}

function _computeBooleanStats<T>(def: BooleanFilterDef<T>, data: T[]): BooleanFilterStats {
  let trueCount = 0;
  let falseCount = 0;
  let nullCount = 0;
  for (const obj of data) {
    const value = keyLookup(obj, def.key);
    if (value == null) {
      nullCount++;
      continue;
    }
    if (value === true) trueCount++;
    if (value === false) falseCount++;
  }
  return { trueCount, falseCount, nullCount };
}

// ---- Filter constructors ----

export function createRangeFilter<T>(
  def: RangeFilterDef<T>,
  data: T[],
  state?: Partial<RangeFilterState>,
): RangeFilter<T> {
  return {
    type: "range",
    id: def.id,
    def,
    state: {
      enabled: false,
      min: null,
      max: null,
      allowNull: false,
      ...def.defaultState,
      ...state,
    },
    stats: _computeRangeStats(def, data),
  };
}

export function createSetFilter<T, V = any>(
  def: SetFilterDef<T, V>,
  data: T[],
  state?: Partial<SetFilterState<V>>,
): SetFilter<T, V> {
  return {
    type: "set",
    id: def.id,
    def,
    state: {
      enabled: false,
      included: [],
      allowNull: false,
      ...def.defaultState,
      ...state,
    },
    stats: _computeSetStats(def, data),
  };
}

export function createBooleanFilter<T>(
  def: BooleanFilterDef<T>,
  data: T[],
  state?: Partial<BooleanFilterState>,
): BooleanFilter<T> {
  return {
    type: "boolean",
    id: def.id,
    def,
    state: {
      enabled: false,
      value: true,
      allowNull: false,
      ...def.defaultState,
      ...state,
    },
    stats: _computeBooleanStats(def, data),
  };
}
