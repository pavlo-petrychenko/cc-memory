import { describe, expect, test } from "bun:test";

import { CliCommand } from "../../../src/cli/args.ts";
import { hook } from "../../../src/cli/commands/hook.command.ts";

describe("hook stub (memory hook <name> — P7 owns the real 5 handlers)", () => {
  test("stays fail-open: exit 0, a diagnostic on stderr, nothing pretending to be hook JSON", () => {
    const outcome = hook({ command: CliCommand.Hook, name: "session-start" });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stderrMessage).toContain("session-start");
    expect(outcome.stderrMessage).toContain("not implemented yet (P7)");
  });
});
