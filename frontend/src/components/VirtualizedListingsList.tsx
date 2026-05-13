import { memo, useLayoutEffect, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

import { type Listing } from "../api/models";
import { ListingUI } from "./ListingUI";

const LIST_ITEM_SPACING_PX = 12;

export const VirtualizedListingsList = memo(function VirtualizedListingsList({
  listings,
  newListingIds,
  sourceNameById,
}: {
  listings: Listing[];
  newListingIds: Set<string>;
  sourceNameById: Record<string, { name: string; globalUrl: string }>;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  const virtualizer = useWindowVirtualizer({
    count: listings.length,
    estimateSize: () => 280,
    overscan: 5,
    scrollMargin,
  });

  useLayoutEffect(() => {
    const updateScrollMargin = () => {
      setScrollMargin(listRef.current?.offsetTop ?? 0);
      virtualizer.measure();
    };

    updateScrollMargin();
    window.addEventListener("resize", updateScrollMargin);
    return () => window.removeEventListener("resize", updateScrollMargin);
  }, [virtualizer]);

  if (listings.length === 0) {
    return null;
  }

  return (
    <div
      ref={listRef}
      className="relative w-full"
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const listing = listings[virtualItem.index];

        return (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            className="absolute top-0 left-0 w-full"
            style={{
              transform: `translateY(${virtualItem.start - scrollMargin}px)`,
            }}
          >
            <div
              style={{ paddingBottom: virtualItem.index === listings.length - 1 ? 0 : LIST_ITEM_SPACING_PX }}
            >
              <ListingUI
                listing={listing}
                isNew={newListingIds.has(listing.id)}
                sourceName={sourceNameById[listing.source]?.name ?? listing.source}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
});