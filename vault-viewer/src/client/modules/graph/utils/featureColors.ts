import { FEATURE_PALETTE, LOOSE_COLOR } from "@shared/contracts/constants.js";

export function getFeatureColorMap(
  ids: string[],
): { map: Map<string, string>; list: string[] } {
  const feats = Array.from(
    new Set(ids.map((id) => (id.split("/")[0] ?? "").trim()).filter(Boolean)),
  ).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const map = new Map<string, string>();
  feats.forEach((f, i) => {
    map.set(f, FEATURE_PALETTE[i % FEATURE_PALETTE.length] as string);
  });
  map.set("", LOOSE_COLOR);
  map.set("loose", LOOSE_COLOR);
  return { map, list: feats };
}
