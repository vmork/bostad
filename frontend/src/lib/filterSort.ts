// ---- Filtering ----

export type KeyFn<T, V = any> = ((t: T) => V) | keyof T;

export function keyLookup<T, V>(x: T, key: KeyFn<T, V>): V {
  return typeof key === "function" ? key(x) : (x[key] as V);
}

// empty included means include all
export type SetFilter<T, V = any> = {
  type: "set";
  id: string;
  enabled: boolean;
  key: KeyFn<T, V>;
  allOptions: V[];
  included: V[];

  name?: string;
  allowNull: boolean; // if true, null data values are considered to be in the set
  nullCount: number;
  group?: string;
};

export type SetFilterOptions = {
  allOptions?: [];
  allowNull?: boolean;
};

export function makeSetFilter<T, V>(
  id: string,
  name: string,
  key: KeyFn<T, V>,
  options?: SetFilterOptions,
): SetFilter<T, V> {
  return {
    type: "set",
    id,
    key,
    allOptions: options?.allOptions ?? [],
    included: [],
    name,
    allowNull: options?.allowNull ?? false,
    nullCount: 0,
    enabled: false,
  };
}

// min === null => min treated as -inf, max === null => max treated as inf
// allowNull == true => null data values treated as in the range
// absMin, absMax, stepSize and boundType are just used for UI purposes
export type RangeFilter<T> = {
  type: "range";
  id: string;
  key: KeyFn<T, number | null>;
  enabled: boolean;
  allowNull: boolean;
  min: number | null;
  max: number | null;

  name?: string;
  boundType: "upper" | "lower" | "both";
  absMin: number;
  absMax: number;
  stepSize: number;
  unit?: string;
  nullCount: number;
  group?: string;
};

export type RangeFilterOptions = {
  boundType?: "upper" | "lower" | "both";
  absMin?: number | null;
  absMax?: number | null;
  min?: number | null;
  max?: number | null;
  stepSize?: number;
  allowNull?: boolean;
  unit?: string;
};

export function makeRangeFilter<T>(
  id: string,
  name: string,
  key: KeyFn<T, number | null>,
  options?: RangeFilterOptions,
): RangeFilter<T> {
  return {
    type: "range",
    id,
    name,
    key,
    min: options?.min ?? null,
    max: options?.max ?? null,
    absMin: options?.absMin ?? -Infinity,
    absMax: options?.absMax ?? Infinity,
    boundType: options?.boundType ?? "both",
    stepSize: options?.stepSize ?? 1,
    allowNull: options?.allowNull ?? false,
    unit: options?.unit,
    nullCount: 0,
    enabled: false,
  };
}

// Boolean filter: when enabled, only items where key(item) === true pass.
// allowNull: if true, null/undefined values also pass (counts as "true").
export type BooleanFilter<T> = {
  type: "boolean";
  id: string;
  key: KeyFn<T, boolean | null | undefined>;
  enabled: boolean;
  allowNull: boolean;

  name?: string;
  trueCount: number;
  nullCount: number;
  group?: string;
};

export function makeBooleanFilter<T>(
  id: string,
  name: string,
  key: KeyFn<T, boolean | null | undefined>,
): BooleanFilter<T> {
  return {
    type: "boolean",
    id,
    name,
    key,
    enabled: false,
    allowNull: false,
    trueCount: 0,
    nullCount: 0,
  };
}

export type Filter<T> = SetFilter<T> | RangeFilter<T> | BooleanFilter<T>;

function _filterItemBySet<T, V>(x: T, filter: SetFilter<T, V>) {
  const { key, included } = filter;
  const value = keyLookup(x, key);
  if (included != null && !included.includes(value as V)) return false;
  return true;
}

function _filterItemByRange<T>(x: T, filter: RangeFilter<T>) {
  const value = keyLookup(x, filter.key);
  if (value == null) return filter.allowNull;
  const min = filter.boundType === "upper" ? -Infinity : (filter.min ?? -Infinity);
  const max = filter.boundType === "lower" ? Infinity : (filter.max ?? Infinity);
  return min <= value && value <= max;
}

function _filterItemByBoolean<T>(x: T, filter: BooleanFilter<T>) {
  const value = keyLookup(x, filter.key);
  if (value == null) return filter.allowNull;
  return value === true;
}

export function applyFiltersToList<T>(xs: T[], filters: Filter<T>[]) {
  return xs.filter((x) => {
    return filters.every((filter) => {
      if (!filter.enabled) return true;
      switch (filter.type) {
        case "set":
          return _filterItemBySet(x, filter);
        case "range":
          return _filterItemByRange(x, filter);
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

export function sortList<T, V = any>(xs: T[], sorts: SortEntry<T, V>[]) {
  return [
    ...xs.sort((a, b) => {
      for (const { key, ascending, cmpFunc } of sorts) {
        const defaultCmpFunc = (x: V, y: V) => (x < y ? -1 : x > y ? 1 : 0);
        const cmp = (cmpFunc ?? defaultCmpFunc)(keyLookup(a, key), keyLookup(b, key));
        if (cmp !== 0) return ascending ? cmp : -cmp;
      }
      return 0;
    }),
  ];
}

// ---- Building filters from data ----

type _KeyDataRange<T> = {
  name: string;
  unit?: string;
  key: KeyFn<T, number | null>;
  sortKey?: KeyFn<T, any>; // overrides key for sorting (e.g. ms-precision vs day-precision)
  filterType: "range";
  filterOptions?: RangeFilterOptions;
  group?: string;
};
type _KeyDataSet<T> = {
  name: string;
  key: KeyFn<T>;
  sortKey?: KeyFn<T, any>;
  filterType: "set";
  filterOptions?: SetFilterOptions;
  group?: string;
};
type _KeyDataBoolean<T> = {
  name: string;
  key: KeyFn<T, boolean | null | undefined>;
  sortKey?: KeyFn<T, any>;
  filterType: "boolean";
  group?: string;
};

export type KeyData<T> = _KeyDataRange<T> | _KeyDataSet<T> | _KeyDataBoolean<T>;

export function buildFilters<T>(allObjects: T[], keyData: Record<string, KeyData<T>>): Filter<T>[] {
  const allFilters = Object.entries(keyData).map(([id, kd]) => {
    switch (kd.filterType) {
      case "range": {
        const f = makeRangeFilter(id, kd.name, kd.key, { ...kd.filterOptions, unit: kd.unit });
        f.group = kd.group;
        return f;
      }
      case "set": {
        const f = makeSetFilter(id, kd.name, kd.key, kd.filterOptions);
        f.group = kd.group;
        return f;
      }
      case "boolean": {
        const f = makeBooleanFilter(id, kd.name, kd.key);
        f.group = kd.group;
        return f;
      }
    }
  });

  // Populate stats: range limits, set options, boolean/null counts
  for (const obj of allObjects) {
    for (const filter of allFilters) {
      const value = keyLookup(obj, filter.key);
      if (value == null) {
        filter.nullCount++;
      }
      if (filter.type === "range") {
        if (value != null) {
          if (filter.absMin === -Infinity || (value as number) < filter.absMin) {
            filter.absMin = value as number;
          }
          if (filter.absMax === Infinity || (value as number) > filter.absMax) {
            filter.absMax = value as number;
          }
        }
      } else if (filter.type === "set") {
        if (value != null && !filter.allOptions.includes(value)) {
          filter.allOptions.push(value);
        }
      } else if (filter.type === "boolean") {
        if (value === true) {
          filter.trueCount++;
        }
      }
    }
  }

  return allFilters;
}

export function buildSortEntries<T>(keyData: Record<string, KeyData<T>>): SortEntry<T>[] {
  return Object.entries(keyData).map(([id, kd]) => ({
    id,
    name: kd.name,
    key: kd.sortKey ?? kd.key,
    ascending: true,
  }));
}
