# Filtering and Sorting Architecture

## Overview

The filtering and sorting pipeline is frontend-only and runs on the in-memory `Listing[]` returned by `useListingsData`.

The control flow is:

1. `useListingsData()` returns `listings` in `frontend/src/App.tsx`.
2. `App.tsx` hydrates persisted filter state and sort state from local storage.
3. `App.tsx` keeps the runtime filters in sync with the current listing data via `syncFiltersWithData(...)`.
4. `App.tsx` computes `displayFilters` with `deriveContextualFilterStats(filters, listings)` so each control shows counts scoped by the other active filters.
5. `App.tsx` computes `displayedListings` with `applyFiltersToList(listings, filters)` and then `sortList(filtered, sortEntries)`.
6. `FilterDropdown.tsx` and `SortDropdown.tsx` mutate the current filter and sort arrays through setters owned by `App.tsx`.

## Core File Responsibilities

### `frontend/src/lib/filterSort.ts`

This file is the generic engine.

- `KeyFn<T, V>` allows a filter or sort to use either a property name or a derived accessor function.
- `RangeFilterDef`, `SetFilterDef`, and `BooleanFilterDef` describe immutable config.
- `RangeFilterState`, `SetFilterState`, and `BooleanFilterState` are the serializable user-controlled states.
- `RangeFilterStats`, `SetFilterStats`, and `BooleanFilterStats` are derived from the active listing dataset.
- `createRangeFilter`, `createSetFilter`, and `createBooleanFilter` assemble a runtime filter object from definition + state + computed stats.
- `applyFiltersToList(...)` applies all enabled filters with `every(...)` semantics.
- `deriveContextualFilterStats(...)` recomputes per-filter stats from the listings that survive the other active filters.
- `sortList(...)` decorates rows with precomputed sort values, applies ordered comparator passes, and falls back to original index for stable ordering.

Important details:

- Range filters support `boundType: "upper" | "lower" | "both"`.
- All filter types support null-aware behavior through `allowNull`.
- Set filters treat `included.length === 0` as include-all unless the UI has disabled the filter.
- Sorting handles `null` values explicitly and pushes them behind non-null values in the default comparator.
- Sorting precomputes key values once per item so time-derived accessors stay stable during the sort pass.
- Set-filter contextual stats preserve the full option universe from the complete dataset so zero-count options remain visible in the UI.

### `frontend/src/lib/keyConfig.ts`

This file is the listing-specific registry and extension point.

- `keyConfig` is the source of truth for which filters and sorts exist.
- Every entry defines `id`, `name`, `type`, `key`, `group`, and type-specific settings.
- Optional `sortKey` lets a field filter on one value and sort on another.
- Optional `showInSort: false` removes a field from sort controls while preserving filter support.
- `defaultState` provides per-field defaults, especially around null handling.

This file also owns lifecycle helpers:

- `buildFilters(data)` builds fresh runtime filters from the config registry.
- `serializeFilters(filters)` strips filters down to `{ id, ...state }` for local storage.
- `hydrateFilter(state, data)` reattaches config and recomputes stats for one persisted filter.
- `syncFiltersWithData(filters, data)` preserves current user selections while refreshing stats from new listings.
- `hydrateFilters(states, data)` restores persisted filters in config order and appends any newly added filters.
- `buildSortEntries()` derives the default sort list from `keyConfig`.
- `serializeSortEntries(entries)` persists only sort `id` and `ascending`.
- `hydrateSortEntries(states)` restores stored order, ignores removed fields, and appends new sort entries.

Notable repository-specific patterns:

- Date-derived filters such as `postAgeDays` filter on a day count but sort by a timestamp-oriented `sortKey`.
- Queue-position and requirement filters commonly use derived accessors into nested optional fields.
- Feature flags are usually boolean filters with `showInSort: false`.

### `frontend/src/App.tsx`

This file is the orchestration layer.

- Reads listing data from `useListingsData()`.
- Reads and writes local storage through `useLocalStorage(...)`.
- Initializes `filters` with `hydrateFilters(...)`.
- Initializes `sortEntries` with `hydrateSortEntries(...)`.
- Re-syncs filter stats whenever `listings` changes via `syncFiltersWithData(...)`.
- Derives `displayFilters` with `deriveContextualFilterStats(...)` before rendering the filter UI.
- Persists filter and sort state with `serializeFilters(...)` and `serializeSortEntries(...)`.
- Computes `displayedListings` with a strict filter-then-sort pipeline.
- Passes contextual `displayFilters` into `FilterDropdown` and passes state into `SortDropdown`.

Important detail:

- `App.tsx` does not define any filter semantics itself. It wires together the registry, persistence, and display pipeline.

### `frontend/src/components/FilterDropdown.tsx`

This file is UI-only state editing for filters.

- `replaceFilter(...)` swaps a single filter object in the array.
- `groupFilters(...)` groups filters by `filter.def.group` using `groupNames` from `keyConfig.ts`.
- Range rows update `min`, `max`, and `enabled` together.
- Set rows use `MultiSelect` and infer enabled state from whether any options are selected.
- Boolean rows currently act as yes-only toggles and can optionally include nulls when the filter is active.
- Entries with `showInFilter: false` remain part of the active filter state but are omitted from the dropdown UI.
- `clearAllFilters()` resets every filter via `resetFilter(...)`.

Important detail:

- The dropdown edits already-constructed runtime filter objects. It does not know how to build filters from scratch.

### `frontend/src/components/SortDropdown.tsx`

This file is UI-only state editing for sort priority and direction.

- Uses `@dnd-kit` to reorder `sortEntries`.
- Toggling direction only changes the `ascending` flag on a single `SortEntry`.
- Reset uses `defaultSortEntries` supplied by `App.tsx`.
- The first sort entry becomes the trigger summary shown in the button label.

Important detail:

- Multi-column sorting is controlled entirely by the order of `sortEntries`; no separate priority metadata exists.

## How To Add A New Filter

1. Add a new entry to `keyConfig`.
2. Choose the correct filter `type`.
3. Point `key` at a direct property or a derived accessor.
4. Set `group` so it appears in the correct section of the filter dropdown.
5. Add `defaultState` if null values need a non-default behavior.
6. Leave `App.tsx` alone unless the new feature changes the orchestration model.

## How To Add A New Sortable Field

1. Add or update the entry in `keyConfig`.
2. Keep `showInSort` enabled, or omit it.
3. Provide `sortKey` if the sortable value should differ from the filter value.
4. Rely on `buildSortEntries()` and `hydrateSortEntries()` to include the new sort automatically.

## Where Bugs Usually Live

- In `keyConfig.ts` when a derived accessor returns the wrong type or wrong null behavior.
- In `filterSort.ts` when predicate or comparator behavior is too generic or not generic enough.
- In local storage hydration when new IDs are introduced or removed.
- In dropdown components when enabled state and visible control state drift out of sync.