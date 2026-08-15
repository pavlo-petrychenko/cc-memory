import type { InjectContextInput } from "@/modules/session/hooks/memoryInject/memoryInject.typedefs.ts";

/** Renders the memory auto-retrieved and injected on `UserPromptSubmit`. */
export class MemoryInjectFormatter {
  formatInjectContext(input: InjectContextInput): string {
    const lines = [
      `Relevant memory (auto-retrieved from workspace \`${input.workspaceId}\` — ` +
        "pointers; open the file for detail, ignore if off-topic):",
    ];
    for (const hit of input.notes) {
      lines.push(`- **${hit.title}** — ${hit.snippet}  ·  \`${hit.relativePath}\``);
    }
    for (const hit of input.worklogs) {
      lines.push(
        `- _(worklog)_ ${hit.title}: ${hit.snippet}  ·  \`${hit.relativePath}\``,
      );
    }
    return lines.join("\n");
  }
}
