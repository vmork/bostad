import { useState } from "react";
import type { Listing as ListingType } from "../api/models";
import { Button } from "./Button";
import { cn } from "../lib/utils";

interface ListingProps {
  listing: ListingType;
}

export function Listing({ listing }: ListingProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 overflow-hidden">
          <pre
            className={cn(
              "overflow-x-auto text-sm text-foreground",
              !expanded && "max-h-32"
            )}
          >
            {JSON.stringify(listing, null, 2)}
          </pre>
        </div>
        <Button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0"
          size="sm"
          variant="ghost"
        >
          {expanded ? "Collapse" : "Expand"}
        </Button>
      </div>
    </div>
  );
}
