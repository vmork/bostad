---
name: filtering-sorting
description: "Understand, extend, or debug the bostad frontend filtering and sorting pipeline. Use when adding a filter, adding a sortable field, changing persisted filter or sort state, or tracing why listings display in a certain order."
---

# Filtering and Sorting

This skill captures how listing filtering and sorting is structured in the bostad frontend.

## When to Use

- Add or modify a listing filter.
- Add or modify a sortable field.
- Debug why a filter does not match expected listings.
- Debug sort order, sort persistence, or default sort behavior.
- Trace how filter and sort controls are wired into the UI.

## First Files To Inspect

- `frontend/src/lib/keyConfig.ts` is the source of truth for which listing fields are filterable and sortable.
- `frontend/src/lib/filterSort.ts` contains the generic filter types, state shapes, stats computation, predicate logic, and sort engine.
- `frontend/src/App.tsx` owns filter state, sort state, local storage persistence, and the filter-then-sort display pipeline.
- `frontend/src/components/FilterDropdown.tsx` renders grouped controls and writes back updated filter objects.
- `frontend/src/components/SortDropdown.tsx` renders sortable priorities and direction toggles.

## Procedure

1. Identify whether the change belongs in config, core engine logic, or UI.
2. Start in `frontend/src/lib/keyConfig.ts` and confirm whether the listing field already has a `keyConfig` entry.
3. If you are adding a standard range, set, or boolean filter, add or edit the definition in `keyConfig` rather than changing `App.tsx`.
4. If filter behavior requires new state shape, stats, or predicate semantics, extend `frontend/src/lib/filterSort.ts`.
5. If the listing field needs one representation for filtering and another for stable sorting, keep `key` for filtering and add `sortKey` for ordering.
6. If the issue is only in presentation or interaction, update `FilterDropdown.tsx` or `SortDropdown.tsx` without moving data logic into the components.
7. Verify local storage hydration and re-sync behavior, especially when new filter IDs are introduced.
8. Run `pnpm exec tsc --noEmit` from `frontend/` after changes.

## Guardrails

- Keep `keyConfig.ts` as the single registry for filter and sort availability.
- Keep `filterSort.ts` generic and listing-agnostic.
- Keep `App.tsx` as the orchestration layer, not the place where filter definitions live.
- Preserve the separation between immutable filter definitions and serializable user state.
- Prefer `showInSort: false` when a field should remain filterable but not user-sortable.
- Use `defaultState` on config entries for null-handling defaults instead of hard-coding special cases in UI code.

## Reference

See [architecture notes](./references/architecture.md) for the concrete structure in this repository.
