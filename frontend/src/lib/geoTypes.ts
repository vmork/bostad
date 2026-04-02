import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

// -- Region (kommun / stadsdelsområde) --

export type RegionProperties = {
  municipality_id: string;
  name: string;
};

export type RegionFeature = Feature<Polygon | MultiPolygon, RegionProperties>;
export type RegionCollection = FeatureCollection<Polygon | MultiPolygon, RegionProperties>;

// -- District (stadsdel) --

export type DistrictProperties = {
  stadsdel_id: number;
  municipality_id: string;
  name: string;
};

export type DistrictFeature = Feature<Polygon | MultiPolygon, DistrictProperties>;
export type DistrictCollection = FeatureCollection<Polygon | MultiPolygon, DistrictProperties>;

// -- Hierarchy mapping (municipality_id → district IDs) --

/** Maps municipality_id to the array of stadsdel_ids belonging to that region. */
export type AreaHierarchy = Record<string, number[]>;
