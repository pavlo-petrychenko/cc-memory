import { describe, expect, test } from "bun:test";

import {
  COMMAND_DESCRIPTORS,
  ENV_VAR_DESCRIPTORS,
  USAGE_HEADER,
} from "@/modules/meta/commands/help.constants.ts";
import { HelpFormatter } from "@/modules/meta/commands/help.formatter.ts";
import type {
  CommandDescriptor,
  EnvVarDescriptor,
} from "@/modules/meta/commands/help.typedefs.ts";

describe("HelpFormatter.render", () => {
  const formatter = new HelpFormatter();

  test("every non-hidden real descriptor prints `memory <name>`", () => {
    const rendered = formatter.render(
      USAGE_HEADER,
      COMMAND_DESCRIPTORS,
      ENV_VAR_DESCRIPTORS,
    );

    const visible = COMMAND_DESCRIPTORS.filter((descriptor) => !descriptor.hidden);
    // Guard against the rule silently covering nothing.
    expect(visible.length).toBeGreaterThan(0);

    for (const descriptor of visible) {
      expect(rendered).toContain(`memory ${descriptor.path.join(" ")}`);
    }
  });

  test("a hidden descriptor is never rendered", () => {
    const hidden: CommandDescriptor = {
      path: ["internal-only"],
      usage: ["internal-only <secret>"],
      summary: "never shown",
      hidden: true,
    };
    const rendered = formatter.render(USAGE_HEADER, [hidden], []);
    expect(rendered).not.toContain("internal-only");
    expect(rendered).not.toContain("never shown");
  });

  test("renders the header, both section headings, and a trailing newline", () => {
    const rendered = formatter.render(USAGE_HEADER, [], []);
    expect(rendered.startsWith(USAGE_HEADER)).toBe(true);
    expect(rendered).toContain("Usage:");
    expect(rendered).toContain("Environment:");
    expect(rendered.endsWith("\n")).toBe(true);
    expect(rendered.endsWith("\n\n")).toBe(false);
  });

  test("a visible descriptor's summary is printed on its usage line", () => {
    const descriptor: CommandDescriptor = {
      path: ["frobnicate"],
      usage: ["frobnicate <thing>"],
      summary: "does the thing",
      hidden: false,
    };
    const rendered = formatter.render(USAGE_HEADER, [descriptor], []);
    expect(rendered).toContain("memory frobnicate <thing>");
    expect(rendered).toContain("does the thing");
  });

  test("multiple usage forms on one descriptor render joined by ' | '", () => {
    const descriptor: CommandDescriptor = {
      path: ["-h"],
      usage: ["-h", "--help"],
      summary: "show this help text",
      hidden: false,
    };
    const rendered = formatter.render(USAGE_HEADER, [descriptor], []);
    expect(rendered).toContain("memory -h | --help");
  });

  test("every documented env var name and description appears", () => {
    const envVars: readonly EnvVarDescriptor[] = [
      { name: "CCMEM_SOME_VAR", description: "does a thing (default 1)" },
    ];
    const rendered = formatter.render(USAGE_HEADER, [], envVars);
    expect(rendered).toContain("CCMEM_SOME_VAR");
    expect(rendered).toContain("does a thing (default 1)");
  });
});
