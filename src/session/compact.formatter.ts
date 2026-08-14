/** Renders the compaction checkpoint block persisted on `PostCompact`. */

export type CompactBlockInput = {
  readonly trigger: string;
  readonly summary: string;
};

export function formatCompactBlock(input: CompactBlockInput): string {
  return `<!-- compaction checkpoint (${input.trigger || "auto"}) -->\n**Compaction summary:**\n\n${input.summary}`;
}
