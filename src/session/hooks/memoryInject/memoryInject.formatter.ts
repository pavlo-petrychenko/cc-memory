import type { InjectContextInput } from "@/session/hooks/memoryInject/memoryInject.typedefs.ts";

/** Renders the auto-retrieved memory injected on `UserPromptSubmit`. */
export function formatInjectContext(input: InjectContextInput): string {
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
