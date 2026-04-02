import { useMemo, useState } from "react";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "../lib/utils";
import type { AreaHierarchy, DistrictCollection, RegionCollection } from "../lib/geoTypes";
import type { HoveredArea } from "./MapFilterModal";

// -- Types --

type AreaSidebarProps = {
  regions: RegionCollection;
  districts: DistrictCollection;
  hierarchy: AreaHierarchy;
  selectedDistricts: number[];
  allowNull: boolean;
  /** Listing counts keyed by district_id, with null key for unknown-location count */
  countsByDistrict: Map<number | null, number>;
  onToggleDistrict: (districtId: number) => void;
  onToggleRegion: (municipalityId: string) => void;
  onSetAllowNull: (allow: boolean) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onHoverArea: (area: HoveredArea) => void;
};

// -- Helpers --

/** Build a sorted list of regions with their child districts for rendering. */
function buildRegionTree(
  regions: RegionCollection,
  districts: DistrictCollection,
  hierarchy: AreaHierarchy,
) {
  // Map district id → name from GeoJSON features
  const districtNames = new Map<number, string>();
  for (const f of districts.features) {
    districtNames.set(f.properties.stadsdel_id, f.properties.name);
  }

  // Build display entries per region
  const entries = regions.features
    .map((regionFeature) => {
      const mId = regionFeature.properties.municipality_id;
      const districtIds = hierarchy[mId] ?? [];
      const children = districtIds
        .map((dId) => ({ id: dId, name: districtNames.get(dId) ?? `#${dId}` }))
        .sort((a, b) => a.name.localeCompare(b.name, "sv"));
      return {
        municipalityId: mId,
        name: regionFeature.properties.name,
        children,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "sv"));
  return entries;
}

// -- Checkbox (matches FilterDropdown style exactly) --

function Checkbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn(
        "w-4 h-4 rounded border flex items-center justify-center cursor-pointer shrink-0 transition-colors",
        checked || indeterminate
          ? "bg-primary border-primary text-white"
          : "border-gs-3/50 bg-gs-0 hover:border-gs-3",
      )}
    >
      {checked && <CheckIcon className="w-3 h-3" strokeWidth={3} />}
      {indeterminate && !checked && <span className="block w-2 h-0.5 bg-white rounded-full" />}
    </button>
  );
}

// -- Main component --

export function AreaSidebar({
  regions,
  districts,
  hierarchy,
  selectedDistricts,
  allowNull,
  countsByDistrict,
  onToggleDistrict,
  onToggleRegion,
  onSetAllowNull,
  onSelectAll,
  onDeselectAll,
  onHoverArea,
}: AreaSidebarProps) {
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
  const selectedSet = useMemo(() => new Set(selectedDistricts), [selectedDistricts]);

  const regionTree = useMemo(
    () => buildRegionTree(regions, districts, hierarchy),
    [regions, districts, hierarchy],
  );

  const toggleExpanded = (mId: string) => {
    setExpandedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(mId)) next.delete(mId);
      else next.add(mId);
      return next;
    });
  };

  const nullCount = countsByDistrict.get(null) ?? 0;

  return (
    <div className="flex flex-col h-full border-l border-gs-2 bg-gs-0">
      {/* Header with select/deselect all */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gs-2">
        <span className="text-xs font-medium text-gs-4 uppercase">Areas</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            className="text-xs text-primary hover:underline cursor-pointer"
          >
            All
          </button>
          <button
            type="button"
            onClick={onDeselectAll}
            className="text-xs text-primary hover:underline cursor-pointer"
          >
            None
          </button>
        </div>
      </div>

      {/* Scrollable region list */}
      <div className="flex-1 overflow-y-auto">
        {regionTree.map((region) => {
          const isExpanded = expandedRegions.has(region.municipalityId);
          const childIds = region.children.map((c) => c.id);
          const selectedChildCount = childIds.filter((id) => selectedSet.has(id)).length;
          const allSelected = childIds.length > 0 && selectedChildCount === childIds.length;
          const someSelected = selectedChildCount > 0 && !allSelected;

          // Sum listing counts for this region
          const regionCount = childIds.reduce(
            (sum, id) => sum + (countsByDistrict.get(id) ?? 0),
            0,
          );

          return (
            <div key={region.municipalityId}>
              {/* Region row */}
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 hover:bg-gs-1 border-b border-gs-2/50",
                  someSelected && "bg-gs-2/30",
                  allSelected && "bg-gs-2/50",
                )}
                onMouseEnter={() => onHoverArea({ type: "region", id: region.municipalityId })}
                onMouseLeave={() => onHoverArea(null)}
              >
                <button
                  type="button"
                  onClick={() => toggleExpanded(region.municipalityId)}
                  className="cursor-pointer shrink-0 p-0.5 -m-0.5 rounded hover:bg-gs-2"
                >
                  {isExpanded ? (
                    <ChevronDownIcon className="w-3.5 h-3.5 text-gs-3" />
                  ) : (
                    <ChevronRightIcon className="w-3.5 h-3.5 text-gs-3" />
                  )}
                </button>
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={() => onToggleRegion(region.municipalityId)}
                />
                <span
                  className="text-sm text-dark flex-1 truncate cursor-pointer"
                  onClick={() => onToggleRegion(region.municipalityId)}
                >
                  {region.name}
                </span>
                {regionCount > 0 && (
                  <span className="text-xxs text-gs-3 tabular-nums">{regionCount}</span>
                )}
              </div>

              {/* District rows (collapsible) */}
              {isExpanded && (
                <div className="bg-gs-0">
                  {region.children.map((district) => {
                    const isSelected = selectedSet.has(district.id);
                    const count = countsByDistrict.get(district.id) ?? 0;
                    return (
                      <div
                        key={district.id}
                        className={cn(
                          "flex items-center gap-2 pl-10 pr-3 py-1 cursor-pointer hover:bg-gs-1",
                          isSelected && "bg-gs-2/30",
                        )}
                        onClick={() => onToggleDistrict(district.id)}
                        onMouseEnter={() => onHoverArea({ type: "district", id: district.id })}
                        onMouseLeave={() => onHoverArea(null)}
                      >
                        <Checkbox
                          checked={isSelected}
                          onChange={() => onToggleDistrict(district.id)}
                        />
                        <span className="text-sm text-dark flex-1 truncate">{district.name}</span>
                        {count > 0 && (
                          <span className="text-xxs text-gs-3 tabular-nums">{count}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Unknown location toggle at the bottom */}
      <div className="border-t border-gs-2 px-3 py-2">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => onSetAllowNull(!allowNull)}
        >
          <Checkbox checked={allowNull} onChange={() => onSetAllowNull(!allowNull)} />
          <span className="text-sm text-dark">Unknown location</span>
          {nullCount > 0 && <span className="text-xxs text-gs-3 tabular-nums">{nullCount}</span>}
        </div>
      </div>
    </div>
  );
}
