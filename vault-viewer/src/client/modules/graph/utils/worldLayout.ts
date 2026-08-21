// World-space sizing for the graph canvas. The world grows with the node count
// so large graphs spread out instead of being squeezed into a fixed box; the
// view then zooms to fit. Seeds are deterministic per node id so re-layouts
// (e.g. focus change) stay visually stable instead of exploding randomly.

const BASE_EXTENT = 900;
const MIN_EXTENT = 900;
const MAX_EXTENT = 5200;

/** World square side length for a given node count (~sqrt growth). */
export function computeWorldExtent(nodeCount: number): number {
  const grown = BASE_EXTENT * Math.sqrt(Math.max(1, nodeCount) / 40);
  return Math.min(MAX_EXTENT, Math.max(MIN_EXTENT, Math.round(grown)));
}

export type ClusterSeeds = {
  xOf: (feature: string) => number;
  yOf: (feature: string) => number;
};

export type SeedPosition = { x: number; y: number };

/** Ring of cluster anchor points sized to the world extent. */
export function computeClusterSeeds(featureList: string[], extent: number): ClusterSeeds {
  const cx = extent / 2;
  const cy = extent / 2;
  const count = Math.max(1, featureList.length);
  const radius = extent * 0.3;

  const map = new Map<string, { x: number; y: number }>();
  featureList.forEach((f, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    map.set(f, { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  });
  map.set("", { x: cx, y: cy });

  return {
    xOf: (f) => map.get(f)?.x ?? cx,
    yOf: (f) => map.get(f)?.y ?? cy,
  };
}

/** Stable pseudo-random in [0, 1) derived from a string. */
export function seededRandom(seed: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // xorshift to spread bits
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return ((h >>> 0) % 100000) / 100000;
}

/** Deterministic initial position around a cluster center for a node id. */
export function seededPosition(
  id: string,
  centerX: number,
  centerY: number,
  spread: number,
): SeedPosition {
  const angle = seededRandom(id, 1) * Math.PI * 2;
  const r = spread * (0.35 + seededRandom(id, 2) * 0.65);
  return {
    x: centerX + Math.cos(angle) * r,
    y: centerY + Math.sin(angle) * r,
  };
}
