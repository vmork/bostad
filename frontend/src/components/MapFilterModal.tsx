import { useCallback, useEffect, useMemo, useState } from "react";
import type { Listing } from "../api/models";
import { applyFiltersToList, type Filter, type SetFilter } from "../lib/filterSort";
import { getCachedGeoData, loadGeoData } from "../lib/geoData";
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

  // Fetch geo data lazily on first open
  useEffect(() => {
    if (!open || geoData) return;
    loadGeoData().then(setGeoData);
  }, [open, geoData]);

  // -- Filter state helpers --

  const districtFilter = filters.find((f) => f.id === "districtId") as
    | SetFilter<Listing, number>
    | undefined;

  const selectedDistricts = useMemo(() => districtFilter?.state.included ?? [], [districtFilter]);
  const selectedSet = useMemo(() => new Set(selectedDistricts), [selectedDistricts]);
  const allowNull = districtFilter?.state.allowNull ?? false;

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
    (included: number[], newAllowNull: boolean) => {
      if (!districtFilter) return;
      const updated: SetFilter<Listing, number> = {
        ...districtFilter,
        state: {
          ...districtFilter.state,
          included,
          allowNull: newAllowNull,
          enabled: included.length > 0 || !newAllowNull,
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
      updateDistrictFilter(next, allowNull);
    },
    [selectedDistricts, selectedSet, allowNull, updateDistrictFilter],
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
      updateDistrictFilter(next, allowNull);
    },
    [geoData, selectedDistricts, selectedSet, allowNull, updateDistrictFilter],
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
    updateDistrictFilter([...allDistrictIds], true);
  }, [allDistrictIds, updateDistrictFilter]);

  const deselectAll = useCallback(() => {
    updateDistrictFilter([], allowNull);
  }, [allowNull, updateDistrictFilter]);

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
  const includedListings = listings.filter(l => {
    return (l.districtId == null) ? allowNull : selectedSet_.has(l.districtId)
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="flex flex-col w-[min(90vw,72rem)] h-[min(80vh,48rem)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gs-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-dark">Map filter</span>
          <span className="text-xs text-gs-3">
            {includedListings.length}/{listings.length} listings{" · "}
            {selectedDistricts.length}/{totalDistricts} districts
          </span>
        </div>
        <Button size="default" onClick={onClose}>
          Done
        </Button>
      </div>

      {/* Content: map + sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Map area */}
        <div className="flex-2 min-w-0">
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
        <div className="w-72 shrink-0">
          {geoData ? (
            <AreaSidebar
              regions={geoData.regions}
              districts={geoData.districts}
              hierarchy={geoData.hierarchy}
              selectedDistricts={selectedDistricts}
              allowNull={allowNull}
              countsByDistrict={countsByDistrict}
              hoveredDistrictId={hoveredDistrictId}
              hoveredRegionId={hoveredRegionId}
              onToggleDistrict={toggleDistrict}
              onToggleRegion={toggleRegion}
              onHoverDistrict={handleHoverDistrict}
              onHoverRegion={handleHoverRegion}
              onSetAllowNull={(allow) => updateDistrictFilter(selectedDistricts, allow)}
              onSelectAll={selectAll}
              onDeselectAll={deselectAll}
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
