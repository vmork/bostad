import { useEffect, useRef, useState } from "react";
import { Layer, Map, Marker, Source } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import type { Listing } from "../api/models";
import { getCachedGeoData, loadGeoData } from "../lib/geoData";
import { AREA_LABEL_LAYOUT, AREA_LABEL_PAINT, BASEMAP_STYLE, hideBasemapPlaceLabels } from "../lib/mapTheme";
import "maplibre-gl/dist/maplibre-gl.css";

const LABEL_SWITCH_ZOOM = 11;
const DEFAULT_ZOOM = 14.2;
const MIN_ZOOM = 10;
const MAX_ZOOM = 17.5;

type ListingMiniMapProps = {
  listing: Listing;
};

export function ListingMiniMap({ listing }: ListingMiniMapProps) {
  const coords = listing.coords;
  const [geoData, setGeoData] = useState(getCachedGeoData());
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const mapRef = useRef<MapRef>(null);

  useEffect(() => {
    if (geoData) {
      return;
    }
    loadGeoData().then(setGeoData);
  }, [geoData]);

  if (!coords) {
    return null;
  }

  const showDistrictLabels = zoom > LABEL_SWITCH_ZOOM;

  return (
    <div className="relative h-full w-full bg-gs-1/30">
      <Map
        ref={mapRef}
        initialViewState={{ longitude: coords.long, latitude: coords.lat, zoom: DEFAULT_ZOOM }}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        mapStyle={BASEMAP_STYLE}
        style={{ width: "100%", height: "100%" }}
        onLoad={() => {
          const map = mapRef.current?.getMap();
          if (!map) {
            return;
          }
          hideBasemapPlaceLabels(map);
        }}
        onZoomEnd={(event) => setZoom(event.viewState.zoom)}
        attributionControl={false}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
      >
        {geoData && (
          <>
            <Source id={`mini-districts-${listing.id}`} type="geojson" data={geoData.districts}>
              <Layer
                id={`mini-district-label-${listing.id}`}
                type="symbol"
                layout={{ ...AREA_LABEL_LAYOUT, visibility: showDistrictLabels ? "visible" : "none" }}
                paint={AREA_LABEL_PAINT}
              />
            </Source>
            <Source id={`mini-regions-${listing.id}`} type="geojson" data={geoData.regions}>
              <Layer
                id={`mini-region-label-${listing.id}`}
                type="symbol"
                layout={{ ...AREA_LABEL_LAYOUT, visibility: showDistrictLabels ? "none" : "visible" }}
                paint={AREA_LABEL_PAINT}
              />
            </Source>
          </>
        )}

        <Marker longitude={coords.long} latitude={coords.lat} anchor="bottom">
          <div className="pointer-events-none flex flex-col items-center">
            <span className="block h-4 w-4 rounded-full border-2 border-white bg-[#812020] shadow-[0_0_0_4px_rgba(129,32,32,0.16)]" />
            <span className="-mt-1 block h-3 w-0.5 rounded-full bg-[#812020]" />
          </div>
        </Marker>
      </Map>

      <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded-md bg-white/92 px-2 py-1 text-[11px] leading-snug text-stone-700 shadow-sm backdrop-blur-[1px]">
        <div className="truncate font-medium text-stone-900">
          {listing.locMunicipality} - {listing.locDistrict}
        </div>
        <div className="truncate">{listing.name}</div>
      </div>
    </div>
  );
}