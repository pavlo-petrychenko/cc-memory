/**
 * Renders the KB map injected at SessionStart — `session-start.build_kb_index`
 * (`hooks/session-start.py:63-98`). Agent-visible text (C4): copied verbatim.
 *
 * The Python returns `""` outright when the vault directory doesn't exist —
 * that's a filesystem check, so it stays in the service (`kb-map.ts`, P4/P5),
 * which simply doesn't call this renderer in that case. Given a `features`/
 * `looseNotes` pair (even both empty, for an existing-but-empty vault), this
 * always renders the full header + `## Features` section.
 */

export type KbMapFeature = {
  readonly name: string;
  /** Whether `<kb>/<name>/<name>.md` exists at all — distinct from having a title/description. */
  readonly hasIndexNote: boolean;
  readonly title: string;
  readonly description: string;
  readonly epic: string;
};

export type KbMapInput = {
  /** The vault path, already `tildify`'d for display (`registry.tildify(kb)`). */
  readonly vaultLabel: string;
  readonly features: readonly KbMapFeature[];
  /** Top-level `.md` filenames minus their extension, excluding daily journal files. */
  readonly looseNotes: readonly string[];
};

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

export function renderKbMap(input: KbMapInput): string {
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
