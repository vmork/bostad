import { useMemo, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "../lib/utils";
import { Checkbox } from "./generic/Checkbox";
import type { AreaHierarchy, DistrictCollection, RegionCollection } from "../lib/geoTypes";

// -- Types --

type AreaSidebarProps = {
  regions: RegionCollection;
  districts: DistrictCollection;
  hierarchy: AreaHierarchy;
  selectedDistricts: number[];
  /** Listing counts keyed by district_id. */
  countsByDistrict: Map<number | null, number>;
  hoveredDistrictId: number | null;
  hoveredRegionId: string | null;
  onToggleDistrict: (districtId: number) => void;
  onToggleRegion: (municipalityId: string) => void;
  onHoverDistrict: (districtId: number | null) => void;
  onHoverRegion: (municipalityId: string | null) => void;
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

// -- Main component --

export function AreaSidebar({
  regions,
  districts,
  hierarchy,
  selectedDistricts,
  countsByDistrict,
  hoveredDistrictId,
  hoveredRegionId,
  onToggleDistrict,
  onToggleRegion,
  onHoverDistrict,
  onHoverRegion,
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

  return (
    <div className="flex h-full flex-col border-t border-gs-2 bg-gs-0 md:border-t-0 md:border-l">
      {/* Scrollable region list */}
      <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y">
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
                  hoveredRegionId === region.municipalityId && "bg-sky-100/80",
                  someSelected && "bg-gs-2/30",
                  allSelected && "bg-gs-2/50",
                )}
                onPointerOverCapture={() => onHoverRegion(region.municipalityId)}
                onPointerMoveCapture={() => onHoverRegion(region.municipalityId)}
                onPointerLeave={() => {
                  if (hoveredRegionId === region.municipalityId) onHoverRegion(null);
                }}
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
                          hoveredDistrictId === district.id && "bg-sky-100/80",
                          isSelected && "bg-gs-2/30",
                        )}
                        onClick={() => onToggleDistrict(district.id)}
                        onPointerOverCapture={() => onHoverDistrict(district.id)}
                        onPointerMoveCapture={() => onHoverDistrict(district.id)}
                        onPointerLeave={() => {
                          if (hoveredDistrictId === district.id) onHoverDistrict(null);
                        }}
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
    </div>
  );
}
