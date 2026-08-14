import type { CompactBlockInput } from "@/session/hooks/compactCheckpoint/compactCheckpoint.typedefs.ts";

/** Renders the compaction checkpoint block persisted on `PostCompact`. */
export class CompactCheckpointFormatter {
  // Explicit and empty: this formatter has no dependencies of its own, but an
  // explicit constructor keeps its shape consistent with every other
  // constructor-injected class in this module.
  // eslint-disable-next-line no-useless-constructor
  constructor() {}

  formatCompactBlock(input: CompactBlockInput): string {
    return `<!-- compaction checkpoint (${input.trigger || "auto"}) -->\n**Compaction summary:**\n\n${input.summary}`;
  }
}
