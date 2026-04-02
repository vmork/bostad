import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, useMap } from "react-leaflet";
import type { Map as LeafletMap, Layer, LeafletMouseEvent, PathOptions } from "leaflet";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import type { Listing } from "../api/models";
import type {
  AreaHierarchy,
  DistrictCollection,
  DistrictProperties,
  RegionCollection,
  RegionProperties,
} from "../lib/geoTypes";
import "leaflet/dist/leaflet.css";

// -- Constants --

/** Zoom level at which we switch from regions to districts */
const LAYER_SWITCH_ZOOM = 10;

// Bounds for Stockholm county with some padding
const STOCKHOLM_CENTER: [number, number] = [59.33, 18.07];
const DEFAULT_ZOOM = 9;

// -- Styling --

const baseStyle: PathOptions = {
  weight: 1.5,
  color: "#737373", // gs-3
  fillOpacity: 0,
  fillColor: "transparent",
};

const selectedStyle: PathOptions = {
  ...baseStyle,
  fillColor: "#6280c0", // primary
  fillOpacity: 0.2,
  color: "#6280c0",
  weight: 2,
};

const hoverStyle: PathOptions = {
  fillColor: "#6280c0",
  fillOpacity: 0.1,
};

// -- Zoom-responsive layer visibility --

/** Watches zoom level and toggles visibility of the two layers. */
function ZoomWatcher({
  onZoomChange,
}: {
  onZoomChange: (zoom: number) => void;
}) {
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
  listings: Listing[];
  onToggleDistrict: (districtId: number) => void;
  onToggleRegion: (municipalityId: string) => void;
};

// -- Main component --

export function AreaMap({
  regions,
  districts,
  hierarchy,
  selectedDistricts,
  listings,
  onToggleDistrict,
  onToggleRegion,
}: AreaMapProps) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const showDistricts = zoom > LAYER_SWITCH_ZOOM;

  // Use keys that change with selections to force GeoJSON re-render
  // (react-leaflet GeoJSON doesn't update styles reactively)
  const districtKey = useMemo(
    () => `districts-${[...selectedDistricts].sort().join(",")}`,
    [selectedDistricts],
  );
  const regionKey = useMemo(() => {
    // Derive selected regions from selected districts
    const regionStates = Object.entries(hierarchy).map(([mId, dIds]) => {
      const count = dIds.filter((id) => selectedDistricts.has(id)).length;
      return `${mId}:${count}`;
    });
    return `regions-${regionStates.join(",")}`;
  }, [selectedDistricts, hierarchy]);

  // -- District layer callbacks --

  const districtStyle = useCallback(
    (feature?: Feature<Polygon | MultiPolygon, DistrictProperties>) => {
      if (!feature) return baseStyle;
      return selectedDistricts.has(feature.properties.stadsdel_id) ? selectedStyle : baseStyle;
    },
    [selectedDistricts],
  );

  const onEachDistrict = useCallback(
    (feature: Feature<Polygon | MultiPolygon, DistrictProperties>, layer: Layer) => {
      layer.on({
        click: () => onToggleDistrict(feature.properties.stadsdel_id),
        mouseover: (e: LeafletMouseEvent) => {
          const target = e.target;
          target.setStyle(hoverStyle);
          target.bringToFront();
        },
        mouseout: (e: LeafletMouseEvent) => {
          const target = e.target;
          target.setStyle(
            selectedDistricts.has(feature.properties.stadsdel_id) ? selectedStyle : baseStyle,
          );
        },
      });
      layer.bindTooltip(feature.properties.name, { sticky: true });
    },
    [selectedDistricts, onToggleDistrict],
  );

  // -- Region layer callbacks --

  const regionStyle = useCallback(
    (feature?: Feature<Polygon | MultiPolygon, RegionProperties>) => {
      if (!feature) return baseStyle;
      const dIds = hierarchy[feature.properties.municipality_id] ?? [];
      const selectedCount = dIds.filter((id) => selectedDistricts.has(id)).length;
      if (selectedCount === dIds.length && dIds.length > 0) return selectedStyle;
      if (selectedCount > 0) return { ...selectedStyle, fillOpacity: 0.1 };
      return baseStyle;
    },
    [selectedDistricts, hierarchy],
  );

  const onEachRegion = useCallback(
    (feature: Feature<Polygon | MultiPolygon, RegionProperties>, layer: Layer) => {
      layer.on({
        click: () => onToggleRegion(feature.properties.municipality_id),
        mouseover: (e: LeafletMouseEvent) => {
          e.target.setStyle(hoverStyle);
          e.target.bringToFront();
        },
        mouseout: (e: LeafletMouseEvent) => {
          const target = e.target;
          const dIds = hierarchy[feature.properties.municipality_id] ?? [];
          const selectedCount = dIds.filter((id) => selectedDistricts.has(id)).length;
          if (selectedCount === dIds.length && dIds.length > 0) target.setStyle(selectedStyle);
          else if (selectedCount > 0) target.setStyle({ ...selectedStyle, fillOpacity: 0.1 });
          else target.setStyle(baseStyle);
        },
      });
      layer.bindTooltip(feature.properties.name, { sticky: true });
    },
    [selectedDistricts, hierarchy, onToggleRegion],
  );

  // -- Listing dot positions --
  const listingDots = useMemo(
    () =>
      listings
        .filter((l) => l.coords)
        .map((l) => ({
          lat: l.coords!.lat,
          lng: l.coords!.long,
          selected: l.districtId != null ? selectedDistricts.has(l.districtId) : false,
        })),
    [listings, selectedDistricts],
  );

  return (
    <MapContainer
      center={STOCKHOLM_CENTER}
      zoom={DEFAULT_ZOOM}
      className="h-full w-full"
      zoomControl={true}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
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

      {/* Listing dots */}
      {listingDots.map((dot, i) => (
        <CircleMarker
          key={i}
          center={[dot.lat, dot.lng]}
          radius={3}
          pathOptions={{
            fillColor: dot.selected || selectedDistricts.size === 0 ? "#6280c0" : "#b0b0b0",
            fillOpacity: dot.selected || selectedDistricts.size === 0 ? 0.7 : 0.25,
            stroke: false,
          }}
        />
      ))}
    </MapContainer>
  );
}
