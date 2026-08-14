import { describe, expect, test } from "bun:test";

import { CliCommand } from "../../../src/cli/args.ts";
import { dispatchHook, hook, HookName } from "../../../src/cli/commands/hook.command.ts";
import { parseConfig } from "../../../src/domain/Config.ts";
import { makeTestContainer } from "../../helpers/container.ts";
import type { IoFake } from "../../helpers/fakes/ioFake.fake.ts";
import { makeIoFake } from "../../helpers/fakes/ioFake.fake.ts";

const CONFIG = parseConfig({});

describe("hook dispatch (memory hook <name>)", () => {
  test("an unknown hook name stays fail-open: exit 0, a stderr diagnostic, nothing on stdout", async () => {
    const stdio = makeIoFake();
    const container = makeTestContainer({ stdio });

    const outcome = await dispatchHook(container, CONFIG, {
      command: CliCommand.Hook,
      name: "not-a-real-hook",
    });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.stderrMessage).toContain("not-a-real-hook");
    expect(outcome.stderrMessage).toContain("unknown hook name");
    expect(stdio.written).toEqual([]);
  });

  test("hook() itself (the real-container wrapper) stays fail-open for an unknown name", async () => {
    // The ONE safe way to exercise `hook()` in-process: an unknown name makes
    // `dispatchHook` return before ever calling `runHook`, so this never
    // reaches a real `container.stdio.exit()` (a genuine `process.exit()`
    // for the REAL container `hook()` builds) — which WOULD tear down the
    // entire `bun test` process mid-run for any KNOWN name (confirmed by
    // direct repro; see this packet's final report). Building a real
    // `Container`/`Config` from the actual process environment is itself
    // side-effect-free (every adapter constructor is lazy — I/O only happens
    // when a method is actually called), so this is hermetic despite using
    // `makeRealContainer`.
    const outcome = await hook({ command: CliCommand.Hook, name: "not-a-real-hook" });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stderrMessage).toContain("unknown hook name");
  });

  test("cwd outside any workspace: every known hook name stays silent and exits 0", async () => {
    // No workspace is registered at all (fresh in-memory `fs`), so every hook
    // resolves no workspace regardless of `cwd` — the isolation boundary from
    // CLAUDE.md invariant #2. Independent per-name fixtures, so `Promise.all`
    // (not a sequential loop) runs them.
    await Promise.all(
      Object.values(HookName).map(async (name) => {
        const stdio: IoFake = makeIoFake("{}");
        const container = makeTestContainer({ stdio });

        const outcome = await dispatchHook(container, CONFIG, {
          command: CliCommand.Hook,
          name,
        });

        expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
        expect(stdio.written).toEqual([]);
        expect(stdio.exitCode).toBe(0);
      }),
    );
  });
});
