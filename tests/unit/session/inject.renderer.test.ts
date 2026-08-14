import { describe, expect, test } from "bun:test";

import { renderInjectContext } from "../../../src/session/inject.renderer.ts";

describe("renderInjectContext", () => {
  test("golden: header, one note bullet, one worklog bullet", () => {
    const rendered = renderInjectContext({
      workspaceId: "homeserver",
      notes: [
        {
          title: "Wrap Gate",
          snippet: "the …stop hook… escalates",
          relativePath: "CC-memory/Wrap Gate.md",
        },
      ],
      worklogs: [
        {
          title: "cc-memory",
          snippet: "ported rank.ts",
          relativePath: "cc-memory/2026-08-14.md",
        },
      ],
    });
    expect(rendered).toBe(
      [
        "Relevant memory (auto-retrieved from workspace `homeserver` — pointers; " +
          "open the file for detail, ignore if off-topic):",
        "- **Wrap Gate** — the …stop hook… escalates  ·  `CC-memory/Wrap Gate.md`",
        "- _(worklog)_ cc-memory: ported rank.ts  ·  `cc-memory/2026-08-14.md`",
      ].join("\n"),
    );
  });

  test("no hits at all: just the header line", () => {
    const rendered = renderInjectContext({
      workspaceId: "homeserver",
      notes: [],
      worklogs: [],
    });
    expect(rendered).toBe(
      "Relevant memory (auto-retrieved from workspace `homeserver` — pointers; " +
        "open the file for detail, ignore if off-topic):",
    );
  });
});
