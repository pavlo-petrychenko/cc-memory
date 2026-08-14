import type { InjectContextInput } from "@/session/hooks/memoryInject/memoryInject.typedefs.ts";

/** Renders the memory auto-retrieved and injected on `UserPromptSubmit`. */
export class MemoryInjectFormatter {
  // Explicit and empty: this formatter has no dependencies of its own, but an
  // explicit constructor keeps its shape consistent with every other
  // constructor-injected class in this module.
  // eslint-disable-next-line no-useless-constructor
  constructor() {}

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
