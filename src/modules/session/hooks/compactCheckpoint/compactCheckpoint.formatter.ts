import type { CompactBlockInput } from "@/modules/session/hooks/compactCheckpoint/compactCheckpoint.typedefs.ts";

/** Renders the compaction checkpoint block persisted on `PostCompact`. */
export class CompactCheckpointFormatter {
  formatCompactBlock(input: CompactBlockInput): string {
    return `<!-- compaction checkpoint (${input.trigger || "auto"}) -->\n**Compaction summary:**\n\n${input.summary}`;
  }
}
