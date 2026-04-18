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
import type { LatLngBoundsExpression, Layer, Path, PathOptions } from "leaflet";
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
const SHOW_TOOLTIP_ZOOM = LAYER_SWITCH_ZOOM;

const MAP_BOUNDS: LatLngBoundsExpression = [
  [57, 14],
  [61.5, 22.5],
];

const STOCKHOLM_CENTER: [number, number] = [59.33, 18.07];
const DEFAULT_ZOOM = 9;
const MIN_ZOOM = 8;

// Leaflet defaults place overlay SVG layers around z-index 400.
// We keep explicit named levels so the zoom-specific ordering is easy to reason about.
const REGION_OUTLINE_PANE_Z_INDEX = 405;
const POLYGON_PANE_Z_INDEX = 410;
const DOTS_BELOW_POLYGONS_Z_INDEX = 390;
const DOTS_ABOVE_POLYGONS_Z_INDEX = 420;

// -- Listing dot styling --

const ACTIVE_DOT_STYLE = {
  fillColor: "#812020",
  color: "#000000",
  opacity: 1.0,
  fillOpacity: 0.9,
  stroke: true,
  weight: 0.75,
  radius: 3,
};

const FILTERED_OUT_DOT_STYLE = {
  fillColor: "#bd8d8d",
  fillOpacity: 0.5,
  radius: 3,
  stroke: false,
};

const REGION_OUTLINE_STYLE: PathOptions = {
  color: "#4f5f72",
  fillOpacity: 0,
  interactive: false,
  opacity: 0.95,
  weight: 2.25,
};

type AreaKind = "district" | "region";

type HoverTarget = {
  kind: AreaKind;
  id: number | string;
} | null;

type AreaLayerEntry = {
  kind: AreaKind;
  id: number | string;
  layer: Path;
};

function areaKey(kind: AreaKind, id: number | string) {
  return `${kind}:${id}`;
}

function normalizedAreaId(kind: AreaKind, id: number | string) {
  return kind === "district" ? String(id) : id;
}

// -- Polygon styling --

function getPolygonStyle({
  isSelected,
  isPartiallySelected,
  isHovered,
}: {
  isSelected: boolean;
  isPartiallySelected: boolean;
  isHovered: boolean;
}): PathOptions {
  if (isHovered) {
    return {
      color: "#1d4ed8",
      fillColor: "#60a5fa",
      fillOpacity: 0.34,
      opacity: 0.95,
      weight: 3,
    };
  }
  if (isSelected) {
    return {
      color: "#2563eb",
      fillColor: "#60a5fa",
      fillOpacity: 0.24,
      opacity: 0.9,
      weight: 2,
    };
  }
  if (isPartiallySelected) {
    return {
      color: "#3b82f6",
      fillColor: "#93c5fd",
      fillOpacity: 0.16,
      opacity: 0.8,
      weight: 2,
    };
  }
  return {
    color: "#5b6b80",
    fillColor: "#bfdbfe",
    fillOpacity: 0.06,
    opacity: 0.65,
    weight: 1,
  };
}

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
  includedListingIds: Set<string>;
  selectedDistrictIds: number[];
  selectedRegionIds: string[];
  partiallySelectedRegionIds: string[];
  hoveredDistrictId: number | null;
  hoveredRegionId: string | null;
  onToggleDistrict: (districtId: number) => void;
  onToggleRegion: (municipalityId: string) => void;
};

// -- Main component --

export function AreaMap({
  regions,
  districts,
  listings,
  includedListingIds,
  selectedDistrictIds,
  selectedRegionIds,
  partiallySelectedRegionIds,
  hoveredDistrictId,
  hoveredRegionId,
  onToggleDistrict,
  onToggleRegion,
}: AreaMapProps) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const showDistricts = zoom > LAYER_SWITCH_ZOOM;
  const dotsPaneName = showDistricts ? "listing-dots-above" : "listing-dots-below";
  const dotsPaneZIndex = showDistricts ? DOTS_ABOVE_POLYGONS_Z_INDEX : DOTS_BELOW_POLYGONS_Z_INDEX;

  // Refs for values accessed inside stable event handlers (avoids stale closures).
  // GeoJSON key is stable, so onEachFeature only runs once per mount — handlers
  // must read current state from refs rather than captured closure variables.
  const onToggleDistrictRef = useRef(onToggleDistrict);
  onToggleDistrictRef.current = onToggleDistrict;
  const onToggleRegionRef = useRef(onToggleRegion);
  onToggleRegionRef.current = onToggleRegion;
  const selectedDistrictIdsRef = useRef(new Set(selectedDistrictIds.map(String)));
  const selectedRegionIdsRef = useRef(new Set(selectedRegionIds));
  const partiallySelectedRegionIdsRef = useRef(new Set(partiallySelectedRegionIds));
  const sidebarHoveredRef = useRef<HoverTarget>(
    hoveredDistrictId != null
      ? { kind: "district", id: hoveredDistrictId }
      : hoveredRegionId != null
        ? { kind: "region", id: hoveredRegionId }
        : null,
  );
  const mapHoveredRef = useRef<HoverTarget>(null);
  const areaLayersRef = useRef(new Map<string, AreaLayerEntry>());

  const getHoveredTarget = useCallback(
    () => sidebarHoveredRef.current ?? mapHoveredRef.current,
    [],
  );

  const refreshAreaLayer = useCallback(
    (kind: AreaKind, id: number | string) => {
      const entry = areaLayersRef.current.get(areaKey(kind, id));
      if (!entry) return;

      const hoveredTarget = getHoveredTarget();
      const isHovered =
        hoveredTarget?.kind === kind &&
        normalizedAreaId(kind, hoveredTarget.id) === normalizedAreaId(kind, id);
      const isSelected =
        kind === "district"
          ? selectedDistrictIdsRef.current.has(String(id))
          : selectedRegionIdsRef.current.has(id as string);
      const isPartiallySelected =
        kind === "region" && partiallySelectedRegionIdsRef.current.has(id as string);

      entry.layer.setStyle(
        getPolygonStyle({
          isSelected,
          isPartiallySelected,
          isHovered,
        }),
      );

      if (isHovered) {
        entry.layer.bringToFront();
      }
    },
    [getHoveredTarget],
  );

  const updateMapHover = useCallback(
    (nextHover: HoverTarget) => {
      const previousHover = getHoveredTarget();
      mapHoveredRef.current = nextHover;
      const resolvedHover = getHoveredTarget();

      if (previousHover) refreshAreaLayer(previousHover.kind, previousHover.id);
      if (
        resolvedHover &&
        (!previousHover ||
          previousHover.kind !== resolvedHover.kind ||
          previousHover.id !== resolvedHover.id)
      ) {
        refreshAreaLayer(resolvedHover.kind, resolvedHover.id);
      }
    },
    [getHoveredTarget, refreshAreaLayer],
  );

  const registerAreaLayer = useCallback(
    ({ kind, id, layer }: AreaLayerEntry) => {
      areaLayersRef.current.set(areaKey(kind, id), { kind, id, layer });
      refreshAreaLayer(kind, id);
    },
    [refreshAreaLayer],
  );

  // -- District layer setup (stable — only runs on GeoJSON mount) --

  const onEachDistrict = useCallback(
    (feature: Feature<Polygon | MultiPolygon, DistrictProperties>, layer: Layer) => {
      const id = feature.properties.stadsdel_id;
      const pathLayer = layer as Path;
      registerAreaLayer({ kind: "district", id, layer: pathLayer });
      pathLayer.on({
        click: () => onToggleDistrictRef.current(id),
        mouseover: () => updateMapHover({ kind: "district", id }),
        mouseout: () => updateMapHover(null),
      });
    },
    [registerAreaLayer, updateMapHover],
  );

  // -- Region layer setup (stable — only runs on GeoJSON mount) --

  const onEachRegion = useCallback(
    (feature: Feature<Polygon | MultiPolygon, RegionProperties>, layer: Layer) => {
      const mId = feature.properties.municipality_id;
      const pathLayer = layer as Path;
      registerAreaLayer({ kind: "region", id: mId, layer: pathLayer });
      pathLayer.on({
        click: () => onToggleRegionRef.current(mId),
        mouseover: () => updateMapHover({ kind: "region", id: mId }),
        mouseout: () => updateMapHover(null),
      });
    },
    [registerAreaLayer, updateMapHover],
  );

  useEffect(() => {
    mapHoveredRef.current = null;
  }, [showDistricts]);

  useEffect(() => {
    const previous = selectedDistrictIdsRef.current;
    const next = new Set(selectedDistrictIds.map(String));
    selectedDistrictIdsRef.current = next;
    for (const districtId of new Set([...previous, ...next])) {
      if (previous.has(districtId) !== next.has(districtId)) {
        refreshAreaLayer("district", districtId);
      }
    }
  }, [refreshAreaLayer, selectedDistrictIds]);

  useEffect(() => {
    const previousSelected = selectedRegionIdsRef.current;
    const previousPartial = partiallySelectedRegionIdsRef.current;
    const nextSelected = new Set(selectedRegionIds);
    const nextPartial = new Set(partiallySelectedRegionIds);
    selectedRegionIdsRef.current = nextSelected;
    partiallySelectedRegionIdsRef.current = nextPartial;
    for (const regionId of new Set([
      ...previousSelected,
      ...previousPartial,
      ...nextSelected,
      ...nextPartial,
    ])) {
      const selectionChanged =
        previousSelected.has(regionId) !== nextSelected.has(regionId) ||
        previousPartial.has(regionId) !== nextPartial.has(regionId);
      if (selectionChanged) refreshAreaLayer("region", regionId);
    }
  }, [partiallySelectedRegionIds, refreshAreaLayer, selectedRegionIds]);

  useEffect(() => {
    const previousHover = getHoveredTarget();
    sidebarHoveredRef.current =
      hoveredDistrictId != null
        ? { kind: "district", id: hoveredDistrictId }
        : hoveredRegionId != null
          ? { kind: "region", id: hoveredRegionId }
          : null;
    const nextHover = getHoveredTarget();

    if (previousHover) refreshAreaLayer(previousHover.kind, previousHover.id);
    if (
      nextHover &&
      (!previousHover ||
        previousHover.kind !== nextHover.kind ||
        previousHover.id !== nextHover.id)
    ) {
      refreshAreaLayer(nextHover.kind, nextHover.id);
    }
  }, [getHoveredTarget, hoveredDistrictId, hoveredRegionId, refreshAreaLayer]);

  // -- Listing dot data --

  const listingDots = useMemo(
    () =>
      listings
        .filter((l) => l.coords)
        .map((l) => ({
          id: l.id,
          lat: l.coords!.lat,
          lng: l.coords!.long,
          isIncluded: includedListingIds.has(l.id),
          name: l.name,
          rent: l.rent,
          areaSqm: l.areaSqm,
          numRooms: l.numRooms,
        })),
    [includedListingIds, listings],
  );

  const filteredOutDots = useMemo(
    () => listingDots.filter((dot) => !dot.isIncluded),
    [listingDots],
  );

  const includedDots = useMemo(() => listingDots.filter((dot) => dot.isIncluded), [listingDots]);

  return (
    <MapContainer
      center={STOCKHOLM_CENTER}
      zoom={DEFAULT_ZOOM}
      className="h-full w-full"
      attributionControl={false}
      maxBounds={MAP_BOUNDS}
      maxBoundsViscosity={1}
      minZoom={MIN_ZOOM}
      zoomControl={true}
      scrollWheelZoom={true}
      zoomSnap={0.5}
      wheelPxPerZoomLevel={60}
    >
      <Pane name="area-polygons" style={{ zIndex: POLYGON_PANE_Z_INDEX }} />
      <Pane name="region-outlines" style={{ zIndex: REGION_OUTLINE_PANE_Z_INDEX }} />

      <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
      <ZoomWatcher onZoomChange={setZoom} />

      {/* District polygons (visible when zoomed in) */}
      {showDistricts && (
        <GeoJSON
          key="districts"
          data={districts}
          pane="area-polygons"
          onEachFeature={onEachDistrict as any}
        />
      )}

      {/* Region boundaries stay visible above districts when zoomed in. */}
      {showDistricts && (
        <GeoJSON
          key="region-outlines"
          data={regions}
          pane="region-outlines"
          style={() => REGION_OUTLINE_STYLE}
        />
      )}

      {/* Region polygons (visible when zoomed out) */}
      {!showDistricts && (
        <GeoJSON
          key="regions"
          data={regions}
          pane="area-polygons"
          onEachFeature={onEachRegion as any}
        />
      )}

      {/* Listing dots sit above polygons when zoomed in and below them when zoomed out. */}
      <Pane key={dotsPaneName} name={dotsPaneName} style={{ zIndex: dotsPaneZIndex }}>
        {filteredOutDots.map((dot) => (
          <CircleMarker
            key={dot.id}
            center={[dot.lat, dot.lng]}
            radius={FILTERED_OUT_DOT_STYLE.radius}
            pathOptions={FILTERED_OUT_DOT_STYLE}
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
        {includedDots.map((dot) => (
          <CircleMarker
            key={dot.id}
            center={[dot.lat, dot.lng]}
            radius={ACTIVE_DOT_STYLE.radius}
            pathOptions={ACTIVE_DOT_STYLE}
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
