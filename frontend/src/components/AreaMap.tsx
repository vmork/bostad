import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Tooltip,
  Pane,
  useMap,
} from "react-leaflet";
import type { Layer, LeafletMouseEvent, PathOptions } from "leaflet";
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

/** Zoom level at which we switch from regions to districts */
const LAYER_SWITCH_ZOOM = 11;

// Bounds for Stockholm county with some padding
const STOCKHOLM_CENTER: [number, number] = [59.33, 18.07];
const DEFAULT_ZOOM = 9;

// -- Styling --

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

// -- Zoom-responsive layer visibility --

/** Watches zoom level and toggles visibility of the two layers. */
function ZoomWatcher({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => onZoomChange(map.getZoom());
    map.on("zoomend", handler);
    // Fire immediately with current zoom
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

// -- Main component --

export function AreaMap({
  regions,
  districts,
  hierarchy,
  selectedDistricts,
  hoveredArea,
  listings,
  onToggleDistrict,
  onToggleRegion,
}: AreaMapProps) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const showDistricts = zoom > LAYER_SWITCH_ZOOM;

  // Serialize hover state for GeoJSON key (sidebar hover triggers re-render)
  const hoverKey = hoveredArea ? `${hoveredArea.type}-${hoveredArea.id}` : "none";

  // Use keys that change with selections/hover to force GeoJSON re-render
  // (react-leaflet GeoJSON doesn't update styles reactively)
  const districtKey = useMemo(
    () => `districts-${[...selectedDistricts].sort().join(",")}-${hoverKey}`,
    [selectedDistricts, hoverKey],
  );
  const regionKey = useMemo(() => {
    const regionStates = Object.entries(hierarchy).map(([mId, dIds]) => {
      const count = dIds.filter((id) => selectedDistricts.has(id)).length;
      return `${mId}:${count}`;
    });
    return `regions-${regionStates.join(",")}-${hoverKey}`;
  }, [selectedDistricts, hierarchy, hoverKey]);

  // Resolve which district IDs are hovered (sidebar hover expands region → all children)
  const hoveredDistrictIds = useMemo(() => {
    if (!hoveredArea) return new Set<number>();
    if (hoveredArea.type === "district") return new Set([hoveredArea.id]);
    return new Set(hierarchy[hoveredArea.id] ?? []);
  }, [hoveredArea, hierarchy]);

  const hoveredRegionId = hoveredArea?.type === "region" ? hoveredArea.id : null;

  // -- District layer callbacks --

  const districtStyle = useCallback(
    (feature?: Feature<Polygon | MultiPolygon, DistrictProperties>) => {
      if (!feature) return baseStyle;
      const id = feature.properties.stadsdel_id;
      if (hoveredDistrictIds.has(id)) return hoverStyle;
      return selectedDistricts.has(id) ? selectedStyle : baseStyle;
    },
    [selectedDistricts, hoveredDistrictIds],
  );

  const onEachDistrict = useCallback(
    (feature: Feature<Polygon | MultiPolygon, DistrictProperties>, layer: Layer) => {
      // Permanent label shown on hover — styled to match polygon hover color
      layer.bindTooltip(feature.properties.name, {
        permanent: true,
        direction: "center",
        className: "area-label",
        opacity: 0,
      });

      layer.on({
        click: () => onToggleDistrict(feature.properties.stadsdel_id),
        mouseover: (e: LeafletMouseEvent) => {
          e.target.setStyle(hoverStyle);
          e.target.bringToFront();
          e.target.getTooltip()?.setOpacity(1);
        },
        mouseout: (e: LeafletMouseEvent) => {
          const id = feature.properties.stadsdel_id;
          if (hoveredDistrictIds.has(id)) e.target.setStyle(hoverStyle);
          else e.target.setStyle(selectedDistricts.has(id) ? selectedStyle : baseStyle);
          e.target.getTooltip()?.setOpacity(0);
        },
      });
    },
    [selectedDistricts, hoveredDistrictIds, onToggleDistrict],
  );

  // -- Region layer callbacks --

  /** Compute style for a region based on selection + hover state */
  const getRegionStyle = useCallback(
    (municipalityId: string): PathOptions => {
      if (hoveredRegionId === municipalityId) return hoverStyle;
      const dIds = hierarchy[municipalityId] ?? [];
      const selectedCount = dIds.filter((id) => selectedDistricts.has(id)).length;
      if (selectedCount === dIds.length && dIds.length > 0) return selectedStyle;
      if (selectedCount > 0) return { ...selectedStyle, fillOpacity: 0.1 };
      return baseStyle;
    },
    [selectedDistricts, hierarchy, hoveredRegionId],
  );

  const regionStyle = useCallback(
    (feature?: Feature<Polygon | MultiPolygon, RegionProperties>) => {
      if (!feature) return baseStyle;
      return getRegionStyle(feature.properties.municipality_id);
    },
    [getRegionStyle],
  );

  const onEachRegion = useCallback(
    (feature: Feature<Polygon | MultiPolygon, RegionProperties>, layer: Layer) => {
      layer.bindTooltip(feature.properties.name, {
        permanent: true,
        direction: "center",
        className: "area-label",
        opacity: 0,
      });

      layer.on({
        click: () => onToggleRegion(feature.properties.municipality_id),
        mouseover: (e: LeafletMouseEvent) => {
          e.target.setStyle(hoverStyle);
          e.target.bringToFront();
          e.target.getTooltip()?.setOpacity(1);
        },
        mouseout: (e: LeafletMouseEvent) => {
          e.target.setStyle(getRegionStyle(feature.properties.municipality_id));
          e.target.getTooltip()?.setOpacity(0);
        },
      });
    },
    [getRegionStyle, onToggleRegion],
  );

  // -- Listing dot data --
  const listingDots = useMemo(
    () =>
      listings
        .filter((l) => l.coords)
        .map((l) => ({
          lat: l.coords!.lat,
          lng: l.coords!.long,
          name: l.name,
          rent: l.rent,
          areaSqm: l.areaSqm,
          numRooms: l.numRooms,
        })),
    [listings],
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
          key={districtKey}
          data={districts}
          style={districtStyle as any}
          onEachFeature={onEachDistrict as any}
        />
      )}

      {/* Region polygons (visible when zoomed out) */}
      {!showDistricts && (
        <GeoJSON
          key={regionKey}
          data={regions}
          style={regionStyle as any}
          onEachFeature={onEachRegion as any}
        />
      )}

      {/* Listing dots — rendered in a custom pane above polygons */}
      <Pane name="listing-dots" style={{ zIndex: 450 }}>
        {listingDots.map((dot, i) => (
          <CircleMarker
            key={i}
            center={[dot.lat, dot.lng]}
            radius={4}
            pathOptions={{
              fillColor: "#c32626",
              fillOpacity: 1.0,
              stroke: false,
            }}
          >
            <Tooltip direction="top" offset={[0, -4]} className="listing-tooltip">
              <ListingDotTooltip
                name={dot.name}
                rent={dot.rent}
                areaSqm={dot.areaSqm}
                numRooms={dot.numRooms}
              />
            </Tooltip>
          </CircleMarker>
        ))}
      </Pane>
    </MapContainer>
  );
}
