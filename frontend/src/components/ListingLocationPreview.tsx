import { lazy, Suspense, useEffect, useState } from "react";
import { MapPinIcon, XIcon } from "lucide-react";
import type { Listing } from "../api/models";
import { cn } from "../lib/utils";
import { Dropdown } from "./generic/Dropdown";
import { Modal } from "./generic/Modal";

const ListingMiniMap = lazy(async () => {
  const module = await import("./ListingMiniMap");
  return { default: module.ListingMiniMap };
});

const MOBILE_BREAKPOINT = 768;

type ListingLocationPreviewProps = {
  listing: Listing;
  className?: string;
};

// Keep the mobile branching aligned with the dropdown's existing interaction breakpoint.
function useIsMobileViewport(breakpoint: number) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const updateMatch = () => {
      setIsMobile(mediaQuery.matches);
    };

    updateMatch();
    mediaQuery.addEventListener("change", updateMatch);

    return () => {
      mediaQuery.removeEventListener("change", updateMatch);
    };
  }, [breakpoint]);

  return isMobile;
}

export function ListingLocationPreview({ listing, className }: ListingLocationPreviewProps) {
  const isMobile = useIsMobileViewport(MOBILE_BREAKPOINT);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const locationLabel = `${listing.locMunicipality} - ${listing.locDistrict}`;
  const mapPreviewFallback = (
    <div className="flex h-full w-full items-center justify-center bg-gs-1/30 text-xs text-gs-3">
      Loading map...
    </div>
  );

  useEffect(() => {
    if (!isMobile) {
      setMobilePreviewOpen(false);
    }
  }, [isMobile]);

  const triggerButton = (
    <button
      type="button"
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gs-3 transition-colors",
        "hover:bg-black/5 hover:text-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
      )}
      aria-label={`Show map preview for ${locationLabel}`}
    >
      <MapPinIcon className="h-3.5 w-3.5" strokeWidth={2} />
    </button>
  );

  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <span className="min-w-0 truncate">{locationLabel}</span>

      {listing.coords &&
        (isMobile ? (
          <>
            <button
              type="button"
              className={cn(
                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gs-3 transition-colors",
                "hover:bg-black/5 hover:text-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
              )}
              aria-label={`Show map preview for ${locationLabel}`}
              onClick={() => setMobilePreviewOpen(true)}
            >
              <MapPinIcon className="h-3.5 w-3.5" strokeWidth={2} />
            </button>

            <Modal
              open={mobilePreviewOpen}
              onClose={() => setMobilePreviewOpen(false)}
              className="flex w-[min(92vw,24rem)] flex-col"
            >
              <div className="flex items-start justify-between gap-3 border-b border-gs-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-dark">{locationLabel}</p>
                  <p className="truncate text-xs text-gs-3">{listing.name}</p>
                </div>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gs-2 text-dark transition-colors hover:bg-black/5"
                  aria-label="Close map preview"
                  onClick={() => setMobilePreviewOpen(false)}
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="h-[min(60vh,22rem)] w-full">
                <Suspense fallback={mapPreviewFallback}>
                  <ListingMiniMap listing={listing} />
                </Suspense>
              </div>
            </Modal>
          </>
        ) : (
          <Dropdown.Root triggerMode="hover" preferredSide="bottom" gap={8} closeDelay={120}>
            <Dropdown.Trigger asChild>{triggerButton}</Dropdown.Trigger>
            <Dropdown.Content className="w-[min(22rem,calc(100vw-1rem))] p-2">
              <div className="space-y-2">
                <div className="px-1">
                  <p className="truncate text-sm font-medium text-dark">{locationLabel}</p>
                  <p className="truncate text-xs text-gs-3">{listing.name}</p>
                </div>
                <div className="h-52 overflow-hidden rounded-md border border-gs-2">
                  <Suspense fallback={mapPreviewFallback}>
                    <ListingMiniMap listing={listing} />
                  </Suspense>
                </div>
              </div>
            </Dropdown.Content>
          </Dropdown.Root>
        ))}
    </div>
  );
}