import { useState } from "react";
import type { ListingParseError } from "../api/models";
import { Button } from "./Button";
import { cn } from "../lib/utils";

interface ListingErrorProps {
  error: ListingParseError;
}

export function ListingError({ error }: ListingErrorProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 overflow-hidden">
          <pre
            className={cn(
              "overflow-x-auto text-sm text-red-900",
              !expanded && "max-h-32"
            )}
          >
            {JSON.stringify(error, null, 2)}
          </pre>
        </div>
        <Button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 text-red-700 hover:text-red-800"
          size="sm"
          variant="ghost"
        >
          {expanded ? "Collapse" : "Expand"}
        </Button>
      </div>
    </div>
  );
}
