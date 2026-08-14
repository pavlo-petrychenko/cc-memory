import { describe, expect, test } from "bun:test";

import { CliCommand } from "../../../src/cli/args.ts";
import { install, uninstall } from "../../../src/cli/commands/install.command.ts";

describe("install/uninstall stubs (bin/memory has no equivalent — P9 owns tools/install.py's port)", () => {
  test("install fails loudly rather than claiming to have touched settings.json", () => {
    const outcome = install({ command: CliCommand.Install, dryRun: false });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderrMessage).toContain("not implemented yet (P9)");
  });

  test("install --dry-run is parsed the same way but still fails loudly", () => {
    const outcome = install({ command: CliCommand.Install, dryRun: true });
    expect(outcome.exitCode).toBe(1);
  });

  test("uninstall fails loudly rather than claiming to have reversed anything", () => {
    const outcome = uninstall();
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderrMessage).toContain("not implemented yet (P9)");
  });
});
