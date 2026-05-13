import { type CSSProperties } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowUpIcon, ArrowDownIcon, GripVerticalIcon } from "lucide-react";

import type { Listing } from "../api/models";
import type { SortEntry } from "../lib/filterSort";
import { cn } from "../lib/utils";
import { Button } from "./generic/Button";
import { Dropdown } from "./generic/Dropdown";

// Constrain dragging to the sortable list bounds and the vertical axis.
const restrictToVerticalListBounds: Modifier = ({
  transform,
  draggingNodeRect,
  containerNodeRect,
}) => {
  if (!draggingNodeRect || !containerNodeRect) {
    return {
      ...transform,
      x: 0,
    };
  }

  const minY = containerNodeRect.top - draggingNodeRect.top;
  const maxY = containerNodeRect.bottom - draggingNodeRect.bottom;

  return {
    ...transform,
    x: 0,
    y: Math.min(Math.max(transform.y, minY), maxY),
  };
};

// ----- Sortable row -----

function SortRow({
  entry,
  onToggleDirection,
}: {
  entry: SortEntry<Listing>;
  onToggleDirection: (id: string, ascending: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: entry.id,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dirBtnBase = "flex items-center justify-center w-6 h-6 rounded-md border cursor-pointer";
  const dirBtnActive = "border-primary/50 bg-primary/10 text-primary";
  const dirBtnInactive = "border-gs-3/30 text-gs-3/50 hover:border-gs-3/60";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between gap-2 px-2 py-1.5 bg-gs-0"
    >
      {/* Left side: drag handle + name */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className="flex items-center text-gs-3/60 cursor-grab active:cursor-grabbing touch-none"
          {...listeners}
          {...attributes}
        >
          <GripVerticalIcon className="w-4 h-4" />
        </span>
        <span className="uppercase text-xs text-gs-4 truncate">{entry.name}</span>
      </div>

      {/* Right side: ascending / descending radio pair */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          className={cn(dirBtnBase, entry.ascending ? dirBtnActive : dirBtnInactive)}
          onClick={() => onToggleDirection(entry.id, true)}
          aria-label={`Sort ${entry.name} ascending`}
        >
          <ArrowUpIcon className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          className={cn(dirBtnBase, !entry.ascending ? dirBtnActive : dirBtnInactive)}
          onClick={() => onToggleDirection(entry.id, false)}
          aria-label={`Sort ${entry.name} descending`}
        >
          <ArrowDownIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ----- Main SortDropdown -----

export function SortDropdown({
  sortEntries,
  setSortEntries,
  defaultSortEntries,
}: {
  sortEntries: SortEntry<Listing>[];
  setSortEntries: (entries: SortEntry<Listing>[]) => void;
  defaultSortEntries: SortEntry<Listing>[];
}) {
  // Sensors tuned for desktop click vs mobile long-press
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  // Reorder entries after a drag completes
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = sortEntries.findIndex((e) => e.id === active.id);
      const newIndex = sortEntries.findIndex((e) => e.id === over.id);
      setSortEntries(arrayMove(sortEntries, oldIndex, newIndex));
    }
  };

  // Toggle direction for a single entry
  const handleToggleDirection = (id: string, ascending: boolean) => {
    setSortEntries(sortEntries.map((e) => (e.id === id ? { ...e, ascending } : e)));
  };

  // Reset to default order and all-ascending
  const handleReset = () => {
    setSortEntries(defaultSortEntries);
  };

  // Active state: any entry differs from default (different direction or different order)
  const hasCustomSort = sortEntries.some(
    (entry, i) => !entry.ascending || entry.id !== defaultSortEntries[i]?.id,
  );
  const primarySort = sortEntries[0];
  const triggerLabel = primarySort
    ? `${primarySort.name} ${primarySort.ascending ? "↑" : "↓"}`
    : "Sort";

  return (
    <div className="flex items-center gap-0">
      <Dropdown.Root triggerMode="hover" mobileModalTitle="Sort">
        <Dropdown.Trigger>
          <Button
            size="large"
            className={cn(
              "[word-spacing:-5px]",
              hasCustomSort && "border-primary/60 bg-primary/10 text-primary rounded-r-none",
            )}
          >
            Sort ({triggerLabel})
          </Button>
        </Dropdown.Trigger>
        <Dropdown.Content className="border border-gs-3/50 min-w-64 max-w-[min(22rem,calc(100vw-1.5rem))]">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalListBounds]}
          >
            <SortableContext
              items={sortEntries.map((e) => e.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="py-1 flex flex-col divide-y divide-gs-2">
                {sortEntries.map((entry) => (
                  <SortRow key={entry.id} entry={entry} onToggleDirection={handleToggleDirection} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </Dropdown.Content>
      </Dropdown.Root>
      {hasCustomSort && (
        <Button
          variant="dark"
          size="large"
          className="rounded-l-none border-l-0"
          onClick={handleReset}
        >
          <span className="text-xs">Reset</span>
        </Button>
      )}
    </div>
  );
}
