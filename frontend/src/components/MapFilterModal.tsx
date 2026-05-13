import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type { Listing } from "../api/models";
import { applyFiltersToList, type Filter, type SetFilter } from "../lib/filterSort";
import { getCachedGeoData, loadGeoData } from "../lib/geoData";
import { cn } from "../lib/utils";
import { Modal } from "./generic/Modal";
import { Button } from "./generic/Button";
import { AreaMap } from "./AreaMap";
import { AreaSidebar } from "./AreaSidebar";

// -- Props --

type MapFilterModalProps = {
  open: boolean;
  onClose: () => void;
  filters: Filter<Listing>[];
  setFilters: (filters: Filter<Listing>[]) => void;
  listings: Listing[];
};

// -- Main component --

export function MapFilterModal({
  open,
  onClose,
  filters,
  setFilters,
  listings,
}: MapFilterModalProps) {
  const [geoData, setGeoData] = useState(getCachedGeoData());
  const [hoveredDistrictId, setHoveredDistrictId] = useState<number | null>(null);
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
  const [mobileSidebarExpanded, setMobileSidebarExpanded] = useState(false);

  // Fetch geo data lazily on first open
  useEffect(() => {
    if (!open || geoData) return;
    loadGeoData().then(setGeoData);
  }, [open, geoData]);

  useEffect(() => {
    if (!open) {
      setMobileSidebarExpanded(false);
    }
  }, [open]);

  // -- Filter state helpers --

  const districtFilter = filters.find((f) => f.id === "districtId") as
    | SetFilter<Listing, number>
    | undefined;

  const selectedDistricts = useMemo(() => districtFilter?.state.included ?? [], [districtFilter]);
  const selectedSet = useMemo(() => new Set(selectedDistricts), [selectedDistricts]);

  // Keep all dots on the map, but visually mute listings excluded by the current filter set.
  const includedListingIds = useMemo(
    () => new Set(applyFiltersToList(listings, filters).map((listing) => listing.id)),
    [listings, filters],
  );

  // Sidebar counts should answer "what would remain if I changed the map filter next?"
  const listingsMatchingOtherFilters = useMemo(
    () => applyFiltersToList(listings, filters, { excludeFilterIds: ["districtId"] }),
    [listings, filters],
  );

  /** Replace the districtId filter state immutably */
  const updateDistrictFilter = useCallback(
    (included: number[]) => {
      if (!districtFilter) return;
      const updated: SetFilter<Listing, number> = {
        ...districtFilter,
        state: {
          ...districtFilter.state,
          included,
          allowNull: false,
          enabled: included.length > 0,
        },
      };
      setFilters(filters.map((f) => (f.id === "districtId" ? updated : f)));
    },
    [districtFilter, filters, setFilters],
  );

  // -- Selection handlers --

  const toggleDistrict = useCallback(
    (districtId: number) => {
      const next = selectedSet.has(districtId)
        ? selectedDistricts.filter((id) => id !== districtId)
        : [...selectedDistricts, districtId];
      updateDistrictFilter(next);
    },
    [selectedDistricts, selectedSet, updateDistrictFilter],
  );

  const toggleRegion = useCallback(
    (municipalityId: string) => {
      if (!geoData) return;
      const childIds = geoData.hierarchy[municipalityId] ?? [];
      const anySelected = childIds.some((id) => selectedSet.has(id));
      let next: number[];
      if (anySelected) {
        // Deselect all children (clear on partial or full selection)
        const removeSet = new Set(childIds);
        next = selectedDistricts.filter((id) => !removeSet.has(id));
      } else {
        // Select all children
        const addSet = new Set([...selectedDistricts, ...childIds]);
        next = [...addSet];
      }
      updateDistrictFilter(next);
    },
    [geoData, selectedDistricts, selectedSet, updateDistrictFilter],
  );

  // Compute listing counts per district
  const countsByDistrict = useMemo(() => {
    const counts = new Map<number | null, number>();
    for (const listing of listingsMatchingOtherFilters) {
      const key = listing.districtId ?? null;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [listingsMatchingOtherFilters]);

  // All district IDs available in the hierarchy
  const allDistrictIds = useMemo(() => {
    if (!geoData) return [];
    return Object.values(geoData.hierarchy).flat();
  }, [geoData]);

  const selectedRegionIds = useMemo(() => {
    if (!geoData) return [];
    return Object.entries(geoData.hierarchy)
      .filter(
        ([, districtIds]) =>
          districtIds.length > 0 && districtIds.every((id) => selectedSet.has(id)),
      )
      .map(([municipalityId]) => municipalityId);
  }, [geoData, selectedSet]);

  const partiallySelectedRegionIds = useMemo(() => {
    if (!geoData) return [];
    return Object.entries(geoData.hierarchy)
      .filter(([, districtIds]) => districtIds.some((id) => selectedSet.has(id)))
      .filter(([, districtIds]) => !districtIds.every((id) => selectedSet.has(id)))
      .map(([municipalityId]) => municipalityId);
  }, [geoData, selectedSet]);

  const selectAll = useCallback(() => {
    updateDistrictFilter([...allDistrictIds]);
  }, [allDistrictIds, updateDistrictFilter]);

  const deselectAll = useCallback(() => {
    updateDistrictFilter([]);
  }, [updateDistrictFilter]);

  const handleHoverDistrict = useCallback((districtId: number | null) => {
    setHoveredDistrictId(districtId);
    if (districtId != null) setHoveredRegionId(null);
  }, []);

  const handleHoverRegion = useCallback((municipalityId: string | null) => {
    setHoveredRegionId(municipalityId);
    if (municipalityId != null) setHoveredDistrictId(null);
  }, []);

  if (!open) return null;

  // Header stats
  const totalDistricts = geoData
    ? Object.values(geoData.hierarchy).reduce((sum, ids) => sum + ids.length, 0)
    : 0;
  // Count listings matched by the district filter alone (ignoring other filters)
  const selectedSet_ = new Set(selectedDistricts);
  const includedListings = listings.filter((listing) => {
    return listing.districtId != null && selectedSet_.has(listing.districtId);
  });

  const mobileMapHeightClass = mobileSidebarExpanded ? "h-[32%]" : "h-[76%]";
  const mobileSidebarHeightClass = mobileSidebarExpanded ? "h-[68%]" : "h-[24%]";

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="flex h-[min(92dvh,48rem)] w-[min(96vw,72rem)] flex-col md:h-[min(80vh,48rem)] md:w-[min(90vw,72rem)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-gs-2 px-4 py-3">
        <div className="min-w-0 flex items-center gap-3">
          <span className="text-sm font-medium text-dark">Map filter</span>
          <span className="truncate text-xs text-gs-3">
            {includedListings.length}/{listings.length} listings{" · "}
            {selectedDistricts.length}/{totalDistricts} districts
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="text-xs text-primary transition-colors hover:underline cursor-pointer"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={deselectAll}
            className="text-xs text-primary transition-colors hover:underline cursor-pointer ml-2 mr-5"
          >
            Clear
          </button>
          <Button size="default" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>

      {/* Content: map + sidebar */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Map area */}
        <div className={cn("min-h-0 min-w-0 md:flex-1", mobileMapHeightClass, "md:h-auto")}>
          {geoData ? (
            <AreaMap
              regions={geoData.regions}
              districts={geoData.districts}
              listings={listings}
              includedListingIds={includedListingIds}
              selectedDistrictIds={selectedDistricts}
              selectedRegionIds={selectedRegionIds}
              partiallySelectedRegionIds={partiallySelectedRegionIds}
              hoveredDistrictId={hoveredDistrictId}
              hoveredRegionId={hoveredRegionId}
              onToggleDistrict={toggleDistrict}
              onToggleRegion={toggleRegion}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-gs-3">
              Loading map data…
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div
          className={cn(
            "relative min-h-0 md:w-72 md:shrink-0",
            mobileSidebarHeightClass,
            "md:h-auto",
          )}
        >
          <button
            type="button"
            aria-label={mobileSidebarExpanded ? "Collapse areas sidebar" : "Expand areas sidebar"}
            className="absolute left-1/2 top-0 z-10 inline-flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-gs-2 bg-gs-0 text-dark shadow-[0_12px_24px_rgba(15,23,42,0.14)] transition-colors hover:bg-black/5 md:hidden"
            onClick={() => setMobileSidebarExpanded((current) => !current)}
          >
            {mobileSidebarExpanded ? (
              <ChevronDownIcon className="h-4 w-4" />
            ) : (
              <ChevronUpIcon className="h-4 w-4" />
            )}
          </button>
          {geoData ? (
            <AreaSidebar
              regions={geoData.regions}
              districts={geoData.districts}
              hierarchy={geoData.hierarchy}
              selectedDistricts={selectedDistricts}
              countsByDistrict={countsByDistrict}
              hoveredDistrictId={hoveredDistrictId}
              hoveredRegionId={hoveredRegionId}
              onToggleDistrict={toggleDistrict}
              onToggleRegion={toggleRegion}
              onHoverDistrict={handleHoverDistrict}
              onHoverRegion={handleHoverRegion}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-gs-3">
              Loading…
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
