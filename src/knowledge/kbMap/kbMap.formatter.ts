import type { KbMapFeature, KbMapInput } from "@/knowledge/kbMap/kbMap.typedefs.ts";

function renderFeatureLine(feature: KbMapFeature): string {
  let line = `- **${feature.name}**`;
  if (
    feature.title !== "" &&
    feature.title.toLowerCase() !== feature.name.toLowerCase()
  ) {
    line += ` (${feature.title})`;
  }
  if (feature.description !== "") {
    line += ` — ${feature.description}`;
  } else if (!feature.hasIndexNote) {
    line += " — _(no index note yet)_";
  }
  if (feature.epic !== "") {
    line += `  · epic \`${feature.epic}\``;
  }
  return line;
}

/** Renders the KB map injected at SessionStart — agent-visible text, exact wording
 * matters. */
export class KbMapFormatter {
  format(input: KbMapInput): string {
    const lines = [
      "# Obsidian KB index (auto-injected at session start)",
      "",
      `Top level of the vault at \`${input.vaultLabel}\`. This is the map ` +
        "only — when a topic below matches your task, open that folder's notes " +
        "via the `obsidian` MCP and follow the wikilinks. Capture new durable, " +
        "feature-level knowledge with the `save-learning` skill (writes need " +
        "approval).",
      "",
      "## Features",
    ];
    for (const feature of input.features) lines.push(renderFeatureLine(feature));
    if (input.looseNotes.length > 0) {
      lines.push("", "## Loose top-level notes");
      for (const note of input.looseNotes) lines.push(`- ${note}`);
    }
    return lines.join("\n");
  }
}
