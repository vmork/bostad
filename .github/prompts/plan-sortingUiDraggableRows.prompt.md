## Plan: Sorting UI with Draggable Rows

All 11 `allKeyData` fields are always-active sort keys. Drag reorders priority, up/down buttons toggle direction. Uses `@dnd-kit/sortable` for mobile-compatible drag.

---

**Steps**

**Phase 1 - if needed, update filterSort.ts, but note there is already a `SortEntry` type and `buildSortEntries` function**

**Phase 2 — Install @dnd-kit (`parallel with Phase 1`)** 5. `pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` in `frontend/`

**Phase 3 — Rebuild SortDropdown.tsx** 6. `SortRow` sub-component (stays in same file):

- `useSortable({ id })` for drag; `transform + transition` via inline style
- Left: `GripVertical` icon with `{...listeners} {...attributes}` (handle only, not whole row) + name text
- Right-aligned: `ArrowUp` + `ArrowDown` icon buttons as radio pair — active direction gets `border-primary/50 bg-primary/10` highlight

7. `SortDropdown` component accepts `sortEntries / setSortEntries`:
   - Sensors: `PointerSensor({ distance: 5 })` + `TouchSensor({ delay: 200, tolerance: 5 })`
   - `DndContext(closestCenter) → SortableContext(verticalListSortingStrategy)`, `arrayMove` on drag end
   - Reuses `Dropdown.Root/Trigger/Content` from `generic/Dropdown.tsx`
   - Trigger button active state: any entry is descending (`border-primary/50 bg-primary/10`)
   - Dropdown header: label + Reset button (restores all-ascending, default order)

**Phase 4 — Wire into App.tsx**

- apply sorting to filtered entries, make this final list be the deferred one, called displayedListings or similar

---

**Relevant files**

- `frontend/src/lib/filterSort.ts` — Add 3 new exports
- `frontend/src/components/SortDropdown.tsx` — Full rebuild
- `frontend/src/App.tsx` — Add sort state, wire to both components

**Verification**

1. `pnpm dev` — dropdown renders all 11 rows
2. Drag rows on desktop — listing order updates
3. Mobile (DevTools touch emulation) — long-press drag handle works
4. Up/Down radio buttons toggle correctly; Reset restores defaults
5. TypeScript clean after implementation

**Decisions**

- All 11 fields always contribute to sort (no per-field enable/disable)
- Radio-style direction buttons — one always highlighted
- Drag handle on the grip icon only, not the whole row
- Active trigger = any entry is descending
