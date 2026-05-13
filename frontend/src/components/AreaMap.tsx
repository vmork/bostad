import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map, Marker, Source, Layer, Popup } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent, MapRef } from "react-map-gl/maplibre";
import type { LngLatBoundsLike } from "maplibre-gl";
import type {
  ExpressionSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
  CircleLayerSpecification,
} from "maplibre-gl";
import type { Feature, FeatureCollection, Point } from "geojson";
import type { Listing } from "../api/models";
import type { DistrictCollection, RegionCollection } from "../lib/geoTypes";
import {
  AREA_LABEL_LAYOUT,
  AREA_LABEL_PAINT,
  BASEMAP_STYLE,
  hideBasemapPlaceLabels,
} from "../lib/mapTheme";
import "maplibre-gl/dist/maplibre-gl.css";

// -- Constants --

// Zoom level at which we switch from regions to districts
const LAYER_SWITCH_ZOOM = 11;
// Zoom level at which listing tooltips appear
const SHOW_TOOLTIP_ZOOM = LAYER_SWITCH_ZOOM;
// Zoom level at which active listings switch from dots to clickable rent tags
const SHOW_RENT_LABEL_ZOOM = 13;
const RENT_LABEL_TOOLTIP_OFFSET = 22;

const STOCKHOLM_CENTER = { longitude: 18.07, latitude: 59.33 };
const DEFAULT_ZOOM = 9;
const MIN_ZOOM = 8;
const MAX_BOUNDS: LngLatBoundsLike = [14, 57, 22.5, 61.5]; // [west, south, east, north]

// -- Layer IDs --

const DISTRICT_FILL = "district-fill";
const DISTRICT_LINE = "district-line";
const DISTRICT_LABEL = "district-label";
const REGION_FILL = "region-fill";
const REGION_LINE = "region-line";
const REGION_OUTLINE = "region-outline";
const REGION_LABEL = "region-label";
const DOTS_FILTERED = "dots-filtered";
const DOTS_ACTIVE = "dots-active";

// Layers that respond to click/hover events
const INTERACTIVE_LAYERS = [DISTRICT_FILL, REGION_FILL];

// -- Polygon style tokens --
// Each state maps to fill, fill-opacity, stroke, stroke-opacity, and stroke-width values.

const S_DEFAULT = { fill: "#bfdbfe", fillOp: 0.06, stroke: "#5b6b80", strokeOp: 0.65, w: 1 };
const S_SELECTED = { fill: "#60a5fa", fillOp: 0.24, stroke: "#2563eb", strokeOp: 0.9, w: 2 };
const S_PARTIAL = { fill: "#93c5fd", fillOp: 0.16, stroke: "#3b82f6", strokeOp: 0.8, w: 2 };
const S_HOVERED = { fill: "#60a5fa", fillOp: 0.34, stroke: "#1d4ed8", strokeOp: 0.95, w: 3 };

// -- Dot styling --

const ACTIVE_DOT: CircleLayerSpecification["paint"] = {
  "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 1.75, 11, 2.75, 13, 4.5],
  "circle-color": "#812020",
  "circle-opacity": 0.9,
  "circle-stroke-color": "#000000",
  "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 13, 0.9],
  "circle-stroke-opacity": 1.0,
};

const FILTERED_DOT: CircleLayerSpecification["paint"] = {
  "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 1.25, 11, 2, 13, 3],
  "circle-color": "#bd8d8d",
  "circle-opacity": 0.5,
  "circle-stroke-width": 0,
};

// -- Helpers --

type AreaKind = "district" | "region";
type StyleField = "fill" | "fillOp" | "stroke" | "strokeOp" | "w";

function useCanHoverAreas() {
  const [canHoverAreas, setCanHoverAreas] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setCanHoverAreas(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return canHoverAreas;
}

/** Build a MapLibre "case" expression that assigns style values per feature,
 *  checking hovered → selected → partially-selected → default.
 *  Returns a literal value when there are no conditions to branch on. */
function caseExpr(
  idProp: string,
  hoveredId: string | number | null,
  selectedIds: Set<string | number>,
  partialIds: Set<string | number>,
  field: StyleField,
): ExpressionSpecification {
  const expr: unknown[] = ["case"];
  if (hoveredId != null) {
    expr.push(["==", ["get", idProp], hoveredId], S_HOVERED[field]);
  }
  if (selectedIds.size > 0) {
    expr.push(["in", ["get", idProp], ["literal", [...selectedIds]]], S_SELECTED[field]);
  }
  if (partialIds.size > 0) {
    expr.push(["in", ["get", idProp], ["literal", [...partialIds]]], S_PARTIAL[field]);
  }
  // "case" requires at least one condition-result pair; return literal when none exist
  if (expr.length === 1) return S_DEFAULT[field] as unknown as ExpressionSpecification;
  expr.push(S_DEFAULT[field]);
  return expr as ExpressionSpecification;
}

// -- Tooltip content --

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

function formatRentLabel(rent: number) {
  return `${rent.toLocaleString("sv-SE")} kr`;
}

function toTooltipInfo(listing: Listing) {
  return listing.coords
    ? {
        lng: listing.coords.long,
        lat: listing.coords.lat,
        name: listing.name,
        rent: listing.rent,
        areaSqm: listing.areaSqm,
        numRooms: listing.numRooms,
      }
    : null;
}

// -- Props --

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
  const [mapHover, setMapHover] = useState<{ kind: AreaKind; id: string | number } | null>(null);
  const [tooltipInfo, setTooltipInfo] = useState<{
    lng: number;
    lat: number;
    name: string;
    rent: number;
    areaSqm: number;
    numRooms: number;
  } | null>(null);
  const mapRef = useRef<MapRef>(null);
  const canHoverAreas = useCanHoverAreas();

  const showDistricts = zoom > LAYER_SWITCH_ZOOM;
  const showRentLabels = zoom >= SHOW_RENT_LABEL_ZOOM;

  // Sidebar hover takes priority over map hover
  const effectiveHoveredDistrictId = canHoverAreas
    ? hoveredDistrictId ?? (mapHover?.kind === "district" ? (mapHover.id as number) : null)
    : null;
  const effectiveHoveredRegionId = canHoverAreas
    ? hoveredRegionId ?? (mapHover?.kind === "region" ? (mapHover.id as string) : null)
    : null;

  // -- Selection sets --

  const selectedDistrictSet = useMemo(() => new Set(selectedDistrictIds), [selectedDistrictIds]);
  const selectedRegionSet = useMemo(() => new Set(selectedRegionIds), [selectedRegionIds]);
  const partialRegionSet = useMemo(
    () => new Set(partiallySelectedRegionIds),
    [partiallySelectedRegionIds],
  );

  // -- Paint expressions (recompute when selection/hover state changes) --

  const districtFillPaint = useMemo(
    (): FillLayerSpecification["paint"] => ({
      "fill-color": caseExpr("stadsdel_id", effectiveHoveredDistrictId, selectedDistrictSet, new Set(), "fill"),
      "fill-opacity": caseExpr("stadsdel_id", effectiveHoveredDistrictId, selectedDistrictSet, new Set(), "fillOp"),
    }),
    [effectiveHoveredDistrictId, selectedDistrictSet],
  );

  const districtLinePaint = useMemo(
    (): LineLayerSpecification["paint"] => ({
      "line-color": caseExpr("stadsdel_id", effectiveHoveredDistrictId, selectedDistrictSet, new Set(), "stroke"),
      "line-opacity": caseExpr("stadsdel_id", effectiveHoveredDistrictId, selectedDistrictSet, new Set(), "strokeOp"),
      "line-width": caseExpr("stadsdel_id", effectiveHoveredDistrictId, selectedDistrictSet, new Set(), "w"),
    }),
    [effectiveHoveredDistrictId, selectedDistrictSet],
  );

  const regionFillPaint = useMemo(
    (): FillLayerSpecification["paint"] => ({
      "fill-color": caseExpr("municipality_id", effectiveHoveredRegionId, selectedRegionSet, partialRegionSet, "fill"),
      "fill-opacity": caseExpr("municipality_id", effectiveHoveredRegionId, selectedRegionSet, partialRegionSet, "fillOp"),
    }),
    [effectiveHoveredRegionId, selectedRegionSet, partialRegionSet],
  );

  const regionLinePaint = useMemo(
    (): LineLayerSpecification["paint"] => ({
      "line-color": caseExpr("municipality_id", effectiveHoveredRegionId, selectedRegionSet, partialRegionSet, "stroke"),
      "line-opacity": caseExpr("municipality_id", effectiveHoveredRegionId, selectedRegionSet, partialRegionSet, "strokeOp"),
      "line-width": caseExpr("municipality_id", effectiveHoveredRegionId, selectedRegionSet, partialRegionSet, "w"),
    }),
    [effectiveHoveredRegionId, selectedRegionSet, partialRegionSet],
  );

  // -- Listing dot GeoJSON sources --

  const activeDotSource = useMemo(
    (): FeatureCollection<Point> => ({
      type: "FeatureCollection",
      features: listings
        .filter((l) => l.coords && includedListingIds.has(l.id))
        .map(
          (l): Feature<Point> => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [l.coords!.long, l.coords!.lat] },
            properties: { id: l.id, name: l.name, rent: l.rent, areaSqm: l.areaSqm, numRooms: l.numRooms },
          }),
        ),
    }),
    [listings, includedListingIds],
  );

  const filteredDotSource = useMemo(
    (): FeatureCollection<Point> => ({
      type: "FeatureCollection",
      features: listings
        .filter((l) => l.coords && !includedListingIds.has(l.id))
        .map(
          (l): Feature<Point> => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [l.coords!.long, l.coords!.lat] },
            properties: { id: l.id, name: l.name, rent: l.rent, areaSqm: l.areaSqm, numRooms: l.numRooms },
          }),
        ),
    }),
    [listings, includedListingIds],
  );

  const activeRentLabelListings = useMemo(
    () =>
      showRentLabels
        ? listings.filter((listing) => listing.coords && includedListingIds.has(listing.id))
        : [],
    [includedListingIds, listings, showRentLabels],
  );

  const showTooltipForListing = useCallback((listing: Listing) => {
    setTooltipInfo(toTooltipInfo(listing));
  }, []);

  const clearListingTooltip = useCallback(() => {
    setTooltipInfo(null);
  }, []);

  // -- Event handlers --

  const onMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      setMapHover(null);
      setTooltipInfo(null);
      const feature = e.features?.[0];
      if (!feature) return;
      if (feature.layer.id === DISTRICT_FILL) {
        const id = feature.properties?.stadsdel_id as number;
        if (id != null) onToggleDistrict(id);
      } else if (feature.layer.id === REGION_FILL) {
        const mId = feature.properties?.municipality_id as string;
        if (mId != null) onToggleRegion(mId);
      }
    },
    [onToggleDistrict, onToggleRegion],
  );

  const onMapMouseMove = useCallback(
    (e: MapLayerMouseEvent) => {
      const map = mapRef.current?.getMap();
      if (!map) return;

      if (!canHoverAreas) {
        map.getCanvas().style.cursor = "";
        setMapHover(null);
        setTooltipInfo(null);
        return;
      }

      // Check polygon layers (supplied via interactiveLayerIds → e.features)
      const feature = e.features?.[0];
      if (feature) {
        map.getCanvas().style.cursor = "pointer";
        if (feature.layer.id === DISTRICT_FILL) {
          const id = feature.properties?.stadsdel_id as number;
          if (id != null) setMapHover({ kind: "district", id });
        } else if (feature.layer.id === REGION_FILL) {
          const mId = feature.properties?.municipality_id as string;
          if (mId != null) setMapHover({ kind: "region", id: mId });
        }
      } else {
        map.getCanvas().style.cursor = "";
        setMapHover(null);
      }

      // Dot tooltip hover (manual queryRenderedFeatures for dot layers)
      if (zoom <= SHOW_TOOLTIP_ZOOM) {
        setTooltipInfo(null);
        return;
      }
      const dotLayers = showRentLabels ? [DOTS_FILTERED] : [DOTS_ACTIVE, DOTS_FILTERED];
      const dotFeatures = map.queryRenderedFeatures(e.point, {
        layers: dotLayers,
      });
      if (dotFeatures.length > 0) {
        const df = dotFeatures[0];
        if (df.geometry.type === "Point") {
          const [lng, lat] = df.geometry.coordinates;
          map.getCanvas().style.cursor = "pointer";
          setTooltipInfo({
            lng,
            lat,
            name: df.properties.name,
            rent: df.properties.rent,
            areaSqm: df.properties.areaSqm,
            numRooms: df.properties.numRooms,
          });
          return;
        }
      }
      setTooltipInfo(null);
    },
    [canHoverAreas, showRentLabels, zoom],
  );

  const onMapMouseLeave = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) map.getCanvas().style.cursor = "";
    setMapHover(null);
    setTooltipInfo(null);
  }, []);

  const onZoomEnd = useCallback((e: { viewState: { zoom: number } }) => {
    setZoom(e.viewState.zoom);
  }, []);

  /** Hide basemap place-name layers on initial load so our own labels take over. */
  const onMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    hideBasemapPlaceLabels(map);
  }, []);

  // Clear map hover when layer visibility switches
  const prevShowDistrictsRef = useRef(showDistricts);
  if (prevShowDistrictsRef.current !== showDistricts) {
    prevShowDistrictsRef.current = showDistricts;
    if (mapHover) setMapHover(null);
  }

  return (
    <Map
      ref={mapRef}
      initialViewState={{ ...STOCKHOLM_CENTER, zoom: DEFAULT_ZOOM }}
      minZoom={MIN_ZOOM}
      maxBounds={MAX_BOUNDS}
      mapStyle={BASEMAP_STYLE}
      style={{ width: "100%", height: "100%" }}
      interactiveLayerIds={INTERACTIVE_LAYERS}
      onClick={onMapClick}
      onMouseMove={onMapMouseMove}
      onMouseLeave={onMapMouseLeave}
      onZoomEnd={onZoomEnd}
      onLoad={onMapLoad}
      attributionControl={false}
    >
      {/* -- District polygons + labels (visible when zoomed in) -- */}
      <Source id="districts" type="geojson" data={districts}>
        <Layer
          id={DISTRICT_FILL}
          type="fill"
          paint={districtFillPaint}
          layout={{ visibility: showDistricts ? "visible" : "none" }}
        />
        <Layer
          id={DISTRICT_LINE}
          type="line"
          paint={districtLinePaint}
          layout={{ visibility: showDistricts ? "visible" : "none" }}
        />
        <Layer
          id={DISTRICT_LABEL}
          type="symbol"
          layout={{ ...AREA_LABEL_LAYOUT, visibility: showDistricts ? "visible" : "none" }}
          paint={AREA_LABEL_PAINT}
        />
      </Source>

      {/* Region boundary outlines (visible above districts when zoomed in) */}
      <Source id="region-outlines" type="geojson" data={regions}>
        <Layer
          id={REGION_OUTLINE}
          type="line"
          paint={{ "line-color": "#4f5f72", "line-opacity": 0.95, "line-width": 2.25 }}
          layout={{ visibility: showDistricts ? "visible" : "none" }}
        />
      </Source>

      {/* -- Region polygons + labels (visible when zoomed out) -- */}
      <Source id="regions" type="geojson" data={regions}>
        <Layer
          id={REGION_FILL}
          type="fill"
          paint={regionFillPaint}
          layout={{ visibility: showDistricts ? "none" : "visible" }}
        />
        <Layer
          id={REGION_LINE}
          type="line"
          paint={regionLinePaint}
          layout={{ visibility: showDistricts ? "none" : "visible" }}
        />
        <Layer
          id={REGION_LABEL}
          type="symbol"
          layout={{ ...AREA_LABEL_LAYOUT, visibility: showDistricts ? "none" : "visible" }}
          paint={AREA_LABEL_PAINT}
        />
      </Source>

      {/* -- Listing dots -- */}
      <Source id="dots-filtered" type="geojson" data={filteredDotSource}>
        <Layer id={DOTS_FILTERED} type="circle" paint={FILTERED_DOT} />
      </Source>
      <Source id="dots-active" type="geojson" data={activeDotSource}>
        <Layer
          id={DOTS_ACTIVE}
          type="circle"
          paint={ACTIVE_DOT}
          layout={{ visibility: showRentLabels ? "none" : "visible" }}
        />
      </Source>

      {/* High-zoom active listing markers rendered as clickable rent tags. */}
      {showRentLabels &&
        activeRentLabelListings.map((listing) => (
          <Marker
            key={listing.id}
            longitude={listing.coords!.long}
            latitude={listing.coords!.lat}
            anchor="bottom"
          >
            <a
              href={listing.url}
              target="_blank"
              rel="noopener noreferrer"
              title={listing.name}
              onMouseEnter={() => showTooltipForListing(listing)}
              onMouseLeave={clearListingTooltip}
              onFocus={() => showTooltipForListing(listing)}
              onBlur={clearListingTooltip}
              className="block rounded-md border border-stone-700/70 bg-white/95 px-1.5 py-0.5 text-[11px] font-medium leading-none text-stone-800 shadow-sm transition-transform hover:-translate-y-px hover:bg-white"
            >
              {formatRentLabel(listing.rent)}
            </a>
          </Marker>
        ))}

      {/* Dot tooltip popup */}
      {tooltipInfo && zoom > SHOW_TOOLTIP_ZOOM && (
        <Popup
          longitude={tooltipInfo.lng}
          latitude={tooltipInfo.lat}
          closeButton={false}
          closeOnClick={false}
          anchor="bottom"
          offset={showRentLabels ? RENT_LABEL_TOOLTIP_OFFSET : 6}
          className="listing-popup"
        >
          <ListingDotTooltip
            name={tooltipInfo.name}
            rent={tooltipInfo.rent}
            areaSqm={tooltipInfo.areaSqm}
            numRooms={tooltipInfo.numRooms}
          />
        </Popup>
      )}
    </Map>
  );
}
