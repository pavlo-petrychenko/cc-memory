/**
 * Frozen constants — tuning knobs, not free parameters (§7 vault-viewer/docs/architecture.md).
 * Changing a value here is a breaking migration with golden-test update.
 */

// Obsidian-inspired palette — 10 distinct, works dark+light, ordered alphabetically stable
export const FEATURE_PALETTE = [
  "#6C5CFF", // violet (accent)
  "#2A9D8F", // teal
  "#E6A03F", // amber
  "#FF4D4D", // red
  "#3B82F6", // blue
  "#A3FFB5", // phosphor green
  "#F97316", // orange
  "#8B5CF6", // purple
  "#06B6D4", // cyan
  "#84CC16", // lime
] as const;

// Fallback for loose notes (no slash)
export const LOOSE_COLOR = "#7A7A85" as const;

// Search scoring — frozen (BM25-ish viewer variant, divergent from main C7)
export const SEARCH_WEIGHTS = {
  TITLE: 10,
  TAGS: 5,
  REL_PATH: 2,
  BODY: 1,
} as const;

// Graph physics — frozen defaults, persisted via localStorage:consoleGraphConfig
export const GRAPH_DEFAULT_CONFIG = {
  linkDistance: 72,
  linkStrength: 0.55,
  chargeStrength: -140,
  collideRadius: 10,
  clusterStrength: 0.18,
  centerStrength: 0.08,
} as const;

// Limits
export const LIMITS = {
  GRAPH_NODES_FULL: 500,
  GRAPH_EDGES_FULL: 2000,
  SEARCH_HITS: 50,
  BACKLINKS: 20,
  GRAPH_BFS_LRU: 50,
} as const;

// Ports — do not clash with Lab 3413 / Obsidian 3414
export const PORTS = {
  UI: 3415,
  API: 3416,
} as const;
