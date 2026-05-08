import type { Map as MapLibreMap, SymbolLayerSpecification } from "maplibre-gl";

// CartoDB Positron vector basemap (free, no API key)
export const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// Hide built-in place/area labels so the custom geo label layers define the map's naming style.
export const HIDDEN_LABEL_PREFIXES = [
  "place_",
  "poi_",
] as const;

export const AREA_LABEL_LAYOUT: SymbolLayerSpecification["layout"] = {
  "text-field": ["get", "name"],
  "text-size": ["interpolate", ["linear"], ["zoom"], 4, 8, 11, 11],
  "text-anchor": "center",
  "text-max-width": 7,
};

export const AREA_LABEL_PAINT: SymbolLayerSpecification["paint"] = {
  "text-color": "#3a4a5a",
  "text-halo-color": "rgba(255,255,255,0.85)",
  "text-halo-width": 1,
};

export function hideBasemapPlaceLabels(map: MapLibreMap) {
  for (const layer of map.getStyle().layers) {
    if (HIDDEN_LABEL_PREFIXES.some((prefix) => layer.id.startsWith(prefix))) {
      map.setLayoutProperty(layer.id, "visibility", "none");
    }
  }
}