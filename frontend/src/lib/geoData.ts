import type { AreaHierarchy, DistrictCollection, RegionCollection } from "./geoTypes";

export type GeoData = {
  regions: RegionCollection;
  districts: DistrictCollection;
  hierarchy: AreaHierarchy;
};

let geoCache: GeoData | null = null;
let geoLoadPromise: Promise<GeoData> | null = null;

export function getCachedGeoData() {
  return geoCache;
}

export async function loadGeoData() {
  if (geoCache) {
    return geoCache;
  }

  if (!geoLoadPromise) {
    geoLoadPromise = Promise.all([
      fetch("/geo/kommuner.geojson").then((response) => response.json()) as Promise<RegionCollection>,
      fetch("/geo/stadsdelar.geojson").then((response) => response.json()) as Promise<DistrictCollection>,
      fetch("/geo/hierarchy.json").then((response) => response.json()) as Promise<AreaHierarchy>,
    ])
      .then(([regions, districts, hierarchy]) => {
        geoCache = { regions, districts, hierarchy };
        return geoCache;
      })
      .catch((error) => {
        geoLoadPromise = null;
        throw error;
      });
  }

  return geoLoadPromise;
}