import type { CompactBlockInput } from "@/session/hooks/compactCheckpoint/compactCheckpoint.typedefs.ts";

/** Renders the compaction checkpoint block persisted on `PostCompact`. */
export function formatCompactBlock(input: CompactBlockInput): string {
  return `<!-- compaction checkpoint (${input.trigger || "auto"}) -->\n**Compaction summary:**\n\n${input.summary}`;
}
