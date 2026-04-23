import {
  ListingSources,
  type ListingSourceStats,
  type ListingSources as ListingSourceId,
} from "../api/models";

export type SourceMetadata = {
  name: string;
  globalUrl: string;
};

// Fallback metadata keeps the UI usable before any fetch has populated
// per-source stats from the backend.
export const sourceMetadataById: Record<ListingSourceId, SourceMetadata> = {
  [ListingSources.bostadsthlm]: {
    name: "Bostadsförmedlingen",
    globalUrl: "https://bostad.stockholm.se",
  },
};

export function mergeSourceMetadata(
  sourceStats: ListingSourceStats[] | undefined,
): Record<ListingSourceId, SourceMetadata> {
  const merged = { ...sourceMetadataById };

  for (const stat of sourceStats ?? []) {
    merged[stat.source] = {
      name: stat.name,
      globalUrl: stat.globalUrl,
    };
  }

  return merged;
}
