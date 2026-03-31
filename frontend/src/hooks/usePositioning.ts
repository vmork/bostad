import { useState, useLayoutEffect } from "react";

export type Side = "top" | "bottom" | "left" | "right";

export type Position = {
  left: number;
  top: number;
  side: Side;
};


function getSideOrder(preferredSide: Side): Side[] {
  if (preferredSide === "top") {
    return ["top", "bottom", "right", "left"];
  }
  if (preferredSide === "left") {
    return ["left", "right", "bottom", "top"];
  }
  if (preferredSide === "right") {
    return ["right", "left", "bottom", "top"];
  }
  return ["bottom", "top", "right", "left"];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function calculatePosition(
  anchorRect: DOMRect,
  contentRect: DOMRect,
  preferredSide: Side,
  gap: number,
  viewportPadding: number,
): Position {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const sideOrder = getSideOrder(preferredSide);

  const placementBySide: Record<Side, Position> = {
    bottom: {
      left: clamp(
        anchorRect.left,
        viewportPadding,
        viewportWidth - contentRect.width - viewportPadding,
      ),
      top: anchorRect.bottom + gap,
      side: "bottom",
    },
    top: {
      left: clamp(
        anchorRect.left,
        viewportPadding,
        viewportWidth - contentRect.width - viewportPadding,
      ),
      top: anchorRect.top - contentRect.height - gap,
      side: "top",
    },
    right: {
      left: anchorRect.right + gap,
      top: clamp(
        anchorRect.top,
        viewportPadding,
        viewportHeight - contentRect.height - viewportPadding,
      ),
      side: "right",
    },
    left: {
      left: anchorRect.left - contentRect.width - gap,
      top: clamp(
        anchorRect.top,
        viewportPadding,
        viewportHeight - contentRect.height - viewportPadding,
      ),
      side: "left",
    },
  };

  const fitsBySide: Record<Side, boolean> = {
    bottom:
      anchorRect.bottom + gap + contentRect.height <=
      viewportHeight - viewportPadding,
    top: anchorRect.top - gap - contentRect.height >= viewportPadding,
    right:
      anchorRect.right + gap + contentRect.width <=
      viewportWidth - viewportPadding,
    left: anchorRect.left - gap - contentRect.width >= viewportPadding,
  };

  const chosenSide =
    sideOrder.find((side) => fitsBySide[side]) ?? preferredSide;
  const placement = placementBySide[chosenSide];

  return {
    side: placement.side,
    left: clamp(
      placement.left,
      viewportPadding,
      viewportWidth - contentRect.width - viewportPadding,
    ),
    top: clamp(
      placement.top,
      viewportPadding,
      viewportHeight - contentRect.height - viewportPadding,
    ),
  };
}

// Recalculate placement whenever the viewport moves underneath an open dropdown.
export function usePositioning({
  open,
  anchorRef,
  contentRef,
  preferredSide,
  gap,
  viewportPadding,
}: {
  open: boolean;
  anchorRef: React.MutableRefObject<HTMLElement | null>;
  contentRef: React.MutableRefObject<HTMLDivElement | null>;
  preferredSide: Side;
  gap: number;
  viewportPadding: number;
}) {
  const [position, setPosition] = useState<Position | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }

    const updatePosition = () => {
      const anchorNode = anchorRef.current;
      const contentNode = contentRef.current;
      if (!anchorNode || !contentNode) {
        return;
      }

      const anchorRect = anchorNode.getBoundingClientRect();
      const contentRect = contentNode.getBoundingClientRect();
      setPosition(
        calculatePosition(
          anchorRect,
          contentRect,
          preferredSide,
          gap,
          viewportPadding,
        ),
      );
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, contentRef, gap, open, preferredSide, viewportPadding]);

  return position;
}
