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
import type { Layer } from "leaflet";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import type { Listing } from "../api/models";
import type {
  DistrictCollection,
  DistrictProperties,
  RegionCollection,
  RegionProperties,
} from "../lib/geoTypes";
import "leaflet/dist/leaflet.css";

// -- Constants --

// Zoom level at which we switch from regions to districts
const LAYER_SWITCH_ZOOM = 11;
// Zoom level at which listing tooltips appear
const SHOW_TOOLTIP_ZOOM = 11;

const STOCKHOLM_CENTER: [number, number] = [59.33, 18.07];
const DEFAULT_ZOOM = 9;

// -- Listing dot styling --

const dotStyle = {
  fillColor: "#c32626",
  fillOpacity: 1.0,
  stroke: false,
  radius: 4,
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

type AreaMapProps = {
  regions: RegionCollection;
  districts: DistrictCollection;
  listings: Listing[];
  onToggleDistrict: (districtId: number) => void;
  onToggleRegion: (municipalityId: string) => void;
};

// -- Main component --

export function AreaMap({
  regions,
  districts,
  listings,
  onToggleDistrict,
  onToggleRegion,
}: AreaMapProps) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const showDistricts = zoom > LAYER_SWITCH_ZOOM;

  // Refs for values accessed inside stable event handlers (avoids stale closures).
  // GeoJSON key is stable, so onEachFeature only runs once per mount — handlers
  // must read current state from refs rather than captured closure variables.
  const onToggleDistrictRef = useRef(onToggleDistrict);
  onToggleDistrictRef.current = onToggleDistrict;
  const onToggleRegionRef = useRef(onToggleRegion);
  onToggleRegionRef.current = onToggleRegion;

  // -- District layer setup (stable — only runs on GeoJSON mount) --

  const onEachDistrict = useCallback(
    (feature: Feature<Polygon | MultiPolygon, DistrictProperties>, layer: Layer) => {
      const id = feature.properties.stadsdel_id;
      layer.on({ click: () => onToggleDistrictRef.current(id) });
    },
    [],
  );

  // -- Region layer setup (stable — only runs on GeoJSON mount) --

  const onEachRegion = useCallback(
    (feature: Feature<Polygon | MultiPolygon, RegionProperties>, layer: Layer) => {
      const mId = feature.properties.municipality_id;
      layer.on({ click: () => onToggleRegionRef.current(mId) });
    },
    [],
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
        <GeoJSON key="districts" data={districts} onEachFeature={onEachDistrict as any} />
      )}

      {/* Region polygons (visible when zoomed out) */}
      {!showDistricts && (
        <GeoJSON key="regions" data={regions} onEachFeature={onEachRegion as any} />
      )}

      {/* Listing dots — rendered in a custom pane above polygons */}
      <Pane name="listing-dots" style={{ zIndex: 450 }}>
        {listingDots.map((dot) => (
          <CircleMarker
            key={dot.id}
            center={[dot.lat, dot.lng]}
            radius={dotStyle.radius}
            pathOptions={dotStyle}
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
