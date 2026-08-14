/** Renders the auto-retrieved memory injected on `UserPromptSubmit`. */

export type InjectedHit = {
  readonly title: string;
  readonly snippet: string;
  /** Path relative to the workspace's `kb`/`worklogs` root, already computed by
   * the caller. */
  readonly relativePath: string;
};

export type InjectContextInput = {
  readonly workspaceId: string;
  readonly notes: readonly InjectedHit[];
  readonly worklogs: readonly InjectedHit[];
};

export function renderInjectContext(input: InjectContextInput): string {
  const lines = [
    `Relevant memory (auto-retrieved from workspace \`${input.workspaceId}\` — ` +
      "pointers; open the file for detail, ignore if off-topic):",
  ];
  for (const hit of input.notes) {
    lines.push(`- **${hit.title}** — ${hit.snippet}  ·  \`${hit.relativePath}\``);
  }
  for (const hit of input.worklogs) {
    lines.push(`- _(worklog)_ ${hit.title}: ${hit.snippet}  ·  \`${hit.relativePath}\``);
  }
  return lines.join("\n");
}
