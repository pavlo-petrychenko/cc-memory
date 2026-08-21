import { FEATURE_PALETTE, LOOSE_COLOR } from "@shared/contracts/constants.js";

export type FeatureColorMap = {
  map: Map<string, string>;
  list: string[];
};

export function getFeatureColorMap(ids: string[]): FeatureColorMap {
  const feats = Array.from(
    new Set(ids.map((id) => (id.split("/")[0] ?? "").trim()).filter(Boolean)),
  ).toSorted((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const map = new Map<string, string>();
  feats.forEach((f, i) => {
    // The palette cycles over feature count; the fallback only matters for an
    // empty palette, where the modulo index would not resolve anyway.
    map.set(f, FEATURE_PALETTE[i % FEATURE_PALETTE.length] ?? LOOSE_COLOR);
  });
  map.set("", LOOSE_COLOR);
  map.set("loose", LOOSE_COLOR);
  return { map, list: feats };
}
