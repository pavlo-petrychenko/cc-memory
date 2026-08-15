import { describe, expect, test } from "bun:test";

import { CliCommand } from "@/cli/index.ts";
import { ConfigParser } from "@/core/index.ts";
import {
  hook,
  HookDispatchCommand,
} from "@/modules/session/commands/hookDispatch/hookDispatch.command.ts";
import { HookName } from "@/modules/session/session.typedefs.ts";
import type { IoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeIoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";

const CONFIG = new ConfigParser().parse({});

describe("hook dispatch (memory hook <name>)", () => {
  test("an unknown hook name stays fail-open: exit 0, a stderr diagnostic, nothing on stdout", async () => {
    const stdio = makeIoFake();
    const container = makeTestGateways({ stdio });

    const outcome = await new HookDispatchCommand(container, CONFIG).execute({
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
    // `HookDispatchCommand.execute` return before ever calling
    // `HookRuntimeService.run`, so this never reaches a real
    // `container.stdio.exit()` (a genuine `process.exit()` for the REAL
    // container `hook()` builds) — which WOULD tear down the entire `bun
    // test` process mid-run for any KNOWN name. Building a real
    // `Gateways`/`Config` from the actual process environment is itself
    // side-effect-free (every adapter constructor is lazy — I/O only happens
    // when a method is actually called), so this is hermetic despite using
    // `makeRealGateways`.
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
        const container = makeTestGateways({ stdio });

        const outcome = await new HookDispatchCommand(container, CONFIG).execute({
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
