import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Tooltip,
  Pane,
  useMap,
} from "react-leaflet";
import type { Layer, LeafletMouseEvent, Path, PathOptions } from "leaflet";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import type { Listing } from "../api/models";
import type {
  AreaHierarchy,
  DistrictCollection,
  DistrictProperties,
  RegionCollection,
  RegionProperties,
} from "../lib/geoTypes";
import type { HoveredArea } from "./MapFilterModal";
import "leaflet/dist/leaflet.css";

// -- Constants --

// Zoom level at which we switch from regions to districts
const LAYER_SWITCH_ZOOM = 11;
// Zoom level at which listing tooltips appear
const SHOW_TOOLTIP_ZOOM = 11;

const STOCKHOLM_CENTER: [number, number] = [59.33, 18.07];
const DEFAULT_ZOOM = 9;

// -- Polygon styling --

const baseStyle: PathOptions = {
  weight: 1.5,
  color: "#94a3b8", // slate-400
  fillOpacity: 0.04,
  fillColor: "#94a3b8",
};

const selectedStyle: PathOptions = {
  weight: 2,
  color: "#3b82f6", // blue-500
  fillColor: "#3b82f6",
  fillOpacity: 0.18,
};

const hoverStyle: PathOptions = {
  weight: 2,
  color: "#60a5fa", // blue-400
  fillColor: "#60a5fa",
  fillOpacity: 0.25,
};

// -- Listing dot styling --

const filteredDotStyle: PathOptions = {
  fillColor: "#c32626",
  fillOpacity: 1.0,
  stroke: false,
};

const unfilteredDotStyle: PathOptions = {
  fillColor: "#94a3b8", // slate-400
  fillOpacity: 0.35,
  stroke: false,
};

// -- Zoom-responsive layer visibility --

/** Watches zoom level and toggles visibility of the two layers. */
function ZoomWatcher({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => onZoomChange(map.getZoom());
    map.on("zoomend", handler);
    onZoomChange(map.getZoom());
    return () => {
      map.off("zoomend", handler);
    };
  }, [map, onZoomChange]);
  return null;
}

// -- Props --

type AreaMapProps = {
  regions: RegionCollection;
  districts: DistrictCollection;
  hierarchy: AreaHierarchy;
  selectedDistricts: Set<number>;
  hoveredArea: HoveredArea;
  listings: Listing[];
  /** IDs of listings that pass all current filters — shown with accent color */
  filteredListingIds: Set<string>;
  onToggleDistrict: (districtId: number) => void;
  onToggleRegion: (municipalityId: string) => void;
};

// -- Listing dot tooltip --

/** Compact tooltip shown when hovering a listing dot on the map. */
function ListingDotTooltip({
  name,
  rent,
  areaSqm,
  numRooms,
}: {
  name: string;
  rent: number;
  areaSqm: number;
  numRooms: number;
}) {
  return (
    <div className="text-xs leading-snug">
      <div className="font-medium">{name}</div>
      <div className="text-gray-500">
        {rent} kr · {areaSqm} m² · {numRooms} {numRooms === 1 ? "room" : "rooms"}
      </div>
    </div>
  );
}

// -- Helpers --

/** Compute the style for a region polygon given current selection state. */
function computeRegionStyle(
  municipalityId: string,
  hierarchy: AreaHierarchy,
  selectedDistricts: Set<number>,
): PathOptions {
  const dIds = hierarchy[municipalityId] ?? [];
  const selectedCount = dIds.filter((id) => selectedDistricts.has(id)).length;
  if (selectedCount === dIds.length && dIds.length > 0) return selectedStyle;
  if (selectedCount > 0) return { ...selectedStyle, fillOpacity: 0.1 };
  return baseStyle;
}

// -- Main component --

export function AreaMap({
  regions,
  districts,
  hierarchy,
  selectedDistricts,
  hoveredArea,
  listings,
  filteredListingIds,
  onToggleDistrict,
  onToggleRegion,
}: AreaMapProps) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const showDistricts = zoom > LAYER_SWITCH_ZOOM;

  // Layer refs for imperative style updates (avoids expensive GeoJSON re-mount)
  const districtLayersRef = useRef(new Map<number, Path>());
  const regionLayersRef = useRef(new Map<string, Path>());

  // Refs for values accessed inside stable event handlers (avoids stale closures).
  // GeoJSON key is stable, so onEachFeature only runs once per mount — handlers
  // must read current state from refs rather than captured closure variables.
  const selectedDistrictsRef = useRef(selectedDistricts);
  selectedDistrictsRef.current = selectedDistricts;
  const onToggleDistrictRef = useRef(onToggleDistrict);
  onToggleDistrictRef.current = onToggleDistrict;
  const onToggleRegionRef = useRef(onToggleRegion);
  onToggleRegionRef.current = onToggleRegion;

  // Resolve which district IDs are hovered (sidebar hover expands region → all children)
  const hoveredDistrictIds = useMemo(() => {
    if (!hoveredArea) return new Set<number>();
    if (hoveredArea.type === "district") return new Set([hoveredArea.id]);
    return new Set(hierarchy[hoveredArea.id] ?? []);
  }, [hoveredArea, hierarchy]);

  const hoveredRegionId = hoveredArea?.type === "region" ? hoveredArea.id : null;

  // -- Imperative style updates (selection + hover) --

  useEffect(() => {
    for (const [id, layer] of districtLayersRef.current) {
      const style = hoveredDistrictIds.has(id)
        ? hoverStyle
        : selectedDistricts.has(id)
          ? selectedStyle
          : baseStyle;
      layer.setStyle(style);
      if (hoveredDistrictIds.has(id)) layer.bringToFront();
    }
  }, [hoveredDistrictIds, selectedDistricts]);

  useEffect(() => {
    for (const [mId, layer] of regionLayersRef.current) {
      let style: PathOptions;
      if (hoveredRegionId === mId) style = hoverStyle;
      else style = computeRegionStyle(mId, hierarchy, selectedDistricts);
      layer.setStyle(style);
      if (hoveredRegionId === mId) layer.bringToFront();
    }
  }, [hoveredRegionId, selectedDistricts, hierarchy]);

  // -- District layer setup (stable — only runs on GeoJSON mount) --

  const onEachDistrict = useCallback(
    (feature: Feature<Polygon | MultiPolygon, DistrictProperties>, layer: Layer) => {
      const id = feature.properties.stadsdel_id;
      districtLayersRef.current.set(id, layer as Path);

      layer.bindTooltip(feature.properties.name, {
        permanent: true,
        direction: "center",
        className: "area-label",
        opacity: 0,
      });

      layer.on({
        click: () => onToggleDistrictRef.current(id),
        mouseover: (e: LeafletMouseEvent) => {
          e.target.setStyle(hoverStyle);
          e.target.bringToFront();
          e.target.getTooltip()?.setOpacity(1);
        },
        mouseout: (e: LeafletMouseEvent) => {
          e.target.setStyle(
            selectedDistrictsRef.current.has(id) ? selectedStyle : baseStyle,
          );
          e.target.getTooltip()?.setOpacity(0);
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // -- Region layer setup (stable — only runs on GeoJSON mount) --

  const onEachRegion = useCallback(
    (feature: Feature<Polygon | MultiPolygon, RegionProperties>, layer: Layer) => {
      const mId = feature.properties.municipality_id;
      regionLayersRef.current.set(mId, layer as Path);

      layer.bindTooltip(feature.properties.name, {
        permanent: true,
        direction: "center",
        className: "area-label",
        opacity: 0,
      });

      layer.on({
        click: () => onToggleRegionRef.current(mId),
        mouseover: (e: LeafletMouseEvent) => {
          e.target.setStyle(hoverStyle);
          e.target.bringToFront();
          e.target.getTooltip()?.setOpacity(1);
        },
        mouseout: (e: LeafletMouseEvent) => {
          e.target.setStyle(
            computeRegionStyle(mId, hierarchy, selectedDistrictsRef.current),
          );
          e.target.getTooltip()?.setOpacity(0);
        },
      });
    },
    // hierarchy is stable (loaded once from geo cache)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hierarchy],
  );

  // -- Listing dot data --

  const listingDots = useMemo(
    () =>
      listings
        .filter((l) => l.coords)
        .map((l) => ({
          id: l.id,
          lat: l.coords!.lat,
          lng: l.coords!.long,
          name: l.name,
          rent: l.rent,
          areaSqm: l.areaSqm,
          numRooms: l.numRooms,
          isFiltered: filteredListingIds.has(l.id),
        })),
    [listings, filteredListingIds],
  );

  return (
    <MapContainer
      center={STOCKHOLM_CENTER}
      zoom={DEFAULT_ZOOM}
      className="h-full w-full"
      attributionControl={false}
      zoomControl={true}
      scrollWheelZoom={true}
      zoomSnap={0.5}
      wheelPxPerZoomLevel={60}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
      <ZoomWatcher onZoomChange={setZoom} />

      {/* District polygons (visible when zoomed in) */}
      {showDistricts && (
        <GeoJSON
          key="districts"
          data={districts}
          style={() => baseStyle}
          onEachFeature={onEachDistrict as any}
        />
      )}

      {/* Region polygons (visible when zoomed out) */}
      {!showDistricts && (
        <GeoJSON
          key="regions"
          data={regions}
          style={() => baseStyle}
          onEachFeature={onEachRegion as any}
        />
      )}

      {/* Listing dots — rendered in a custom pane above polygons */}
      <Pane name="listing-dots" style={{ zIndex: 450 }}>
        {listingDots.map((dot) => (
          <CircleMarker
            key={dot.id}
            center={[dot.lat, dot.lng]}
            radius={dot.isFiltered ? 4 : 3}
            pathOptions={dot.isFiltered ? filteredDotStyle : unfilteredDotStyle}
          >
            {zoom > SHOW_TOOLTIP_ZOOM && (
              <Tooltip direction="top" offset={[0, -4]} className="listing-tooltip">
                <ListingDotTooltip
                  name={dot.name}
                  rent={dot.rent}
                  areaSqm={dot.areaSqm}
                  numRooms={dot.numRooms}
                />
              </Tooltip>
            )}
          </CircleMarker>
        ))}
      </Pane>
    </MapContainer>
  );
}
