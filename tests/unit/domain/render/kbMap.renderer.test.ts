import { describe, expect, test } from "bun:test";

import { renderKbMap } from "../../../../src/domain/render/kbMap.renderer.ts";

describe("renderKbMap (C4)", () => {
  test("golden: header, one described feature, one bare feature, loose notes", () => {
    const rendered = renderKbMap({
      vaultLabel: "~/Documents/Homeserver Vault",
      features: [
        {
          name: "Alpha",
          hasIndexNote: true,
          title: "Alpha Feature",
          description: "does alpha things",
          epic: "roadmap-1",
        },
        { name: "Beta", hasIndexNote: false, title: "", description: "", epic: "" },
      ],
      looseNotes: ["Readme", "Glossary"],
    });
    expect(rendered).toBe(
      [
        "# Obsidian KB index (auto-injected at session start)",
        "",
        "Top level of the vault at `~/Documents/Homeserver Vault`. This is the map only — " +
          "when a topic below matches your task, open that folder's notes via the " +
          "`obsidian` MCP and follow the wikilinks. Capture new durable, feature-level " +
          "knowledge with the `save-learning` skill (writes need approval).",
        "",
        "## Features",
        "- **Alpha** (Alpha Feature) — does alpha things  · epic `roadmap-1`",
        "- **Beta** — _(no index note yet)_",
        "",
        "## Loose top-level notes",
        "- Readme",
        "- Glossary",
      ].join("\n"),
    );
  });

  test("no loose notes -> no trailing section at all", () => {
    const rendered = renderKbMap({ vaultLabel: "~/Vault", features: [], looseNotes: [] });
    expect(rendered.endsWith("## Features")).toBe(true);
    expect(rendered).not.toContain("Loose top-level");
  });

  test("a feature title identical (case-insensitively) to its folder name is not repeated", () => {
    const rendered = renderKbMap({
      vaultLabel: "~/Vault",
      features: [
        { name: "Alpha", hasIndexNote: true, title: "alpha", description: "", epic: "" },
      ],
      looseNotes: [],
    });
    expect(rendered).toContain("- **Alpha**");
    expect(rendered).not.toContain("(alpha)");
  });

  test("a feature with an index note but no description gets no placeholder", () => {
    const rendered = renderKbMap({
      vaultLabel: "~/Vault",
      features: [
        { name: "Alpha", hasIndexNote: true, title: "", description: "", epic: "" },
      ],
      looseNotes: [],
    });
    expect(rendered.endsWith("- **Alpha**")).toBe(true);
    expect(rendered).not.toContain("no index note yet");
  });
});
