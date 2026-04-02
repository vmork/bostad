import { useCallback, useEffect, useMemo, useState } from "react";
import type { Listing } from "../api/models";
import type { Filter, SetFilter } from "../lib/filterSort";
import type {
  AreaHierarchy,
  DistrictCollection,
  RegionCollection,
} from "../lib/geoTypes";
import { Modal } from "./generic/Modal";
import { Button } from "./generic/Button";
import { AreaMap } from "./AreaMap";
import { AreaSidebar } from "./AreaSidebar";

// -- Geo data fetching (cached after first load) --

let geoCache: {
  regions: RegionCollection;
  districts: DistrictCollection;
  hierarchy: AreaHierarchy;
} | null = null;

async function fetchGeoData() {
  if (geoCache) return geoCache;
  const [regions, districts, hierarchy] = await Promise.all([
    fetch("/geo/kommuner.geojson").then((r) => r.json()) as Promise<RegionCollection>,
    fetch("/geo/stadsdelar.geojson").then((r) => r.json()) as Promise<DistrictCollection>,
    fetch("/geo/hierarchy.json").then((r) => r.json()) as Promise<AreaHierarchy>,
  ]);
  geoCache = { regions, districts, hierarchy };
  return geoCache;
}

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
  const [geoData, setGeoData] = useState(geoCache);

  // Fetch geo data lazily on first open
  useEffect(() => {
    if (!open || geoData) return;
    fetchGeoData().then(setGeoData);
  }, [open, geoData]);

  // -- Filter state helpers --

  const districtFilter = filters.find((f) => f.id === "districtId") as
    | SetFilter<Listing, number>
    | undefined;

  const selectedDistricts = useMemo(
    () => districtFilter?.state.included ?? [],
    [districtFilter],
  );
  const selectedSet = useMemo(() => new Set(selectedDistricts), [selectedDistricts]);
  const allowNull = districtFilter?.state.allowNull ?? true;

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
      const allSelected = childIds.every((id) => selectedSet.has(id));
      let next: number[];
      if (allSelected) {
        // Deselect all children
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
    for (const listing of listings) {
      const key = listing.districtId ?? null;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [listings]);

  // All district IDs available in the hierarchy
  const allDistrictIds = useMemo(() => {
    if (!geoData) return [];
    return Object.values(geoData.hierarchy).flat();
  }, [geoData]);

  const selectAll = useCallback(() => {
    updateDistrictFilter([...allDistrictIds], true);
  }, [allDistrictIds, updateDistrictFilter]);

  const deselectAll = useCallback(() => {
    updateDistrictFilter([], allowNull);
  }, [allowNull, updateDistrictFilter]);

  if (!open) return null;

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
          {selectedDistricts.length > 0 && (
            <span className="text-xs text-gs-3">
              {selectedDistricts.length} area{selectedDistricts.length !== 1 ? "s" : ""} selected
            </span>
          )}
        </div>
        <Button size="default" onClick={onClose}>
          Done
        </Button>
      </div>

      {/* Content: map + sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Map area */}
        <div className="flex-[2] min-w-0">
          {geoData ? (
            <AreaMap
              regions={geoData.regions}
              districts={geoData.districts}
              hierarchy={geoData.hierarchy}
              selectedDistricts={selectedSet}
              listings={listings}
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
              onToggleDistrict={toggleDistrict}
              onToggleRegion={toggleRegion}
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
