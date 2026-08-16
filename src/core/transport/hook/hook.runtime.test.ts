import { describe, expect, test } from "bun:test";

import { absPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { HookRuntimeService } from "@/core/transport/hook/hook.runtime.ts";
import type { HookHandle } from "@/core/transport/hook/hook.runtime.ts";
import { HookEvent, HookResultKind } from "@/core/transport/hook/hook.typedefs.ts";
import type {
  HookResult,
  WorkspaceResolver,
} from "@/core/transport/hook/hook.typedefs.ts";
import { HookResultSerializer } from "@/core/transport/hook/hookResult.serializer.ts";
import { PayloadParser } from "@/core/transport/hook/payload.parser.ts";
import { makeIoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeLoggerFake } from "@/testing/fakes/loggerCollect.fake.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";

/**
 * `HookRuntimeService.run`'s shared preamble/postamble — the piece exercised
 * only indirectly by the five per-event contract test files (each hands it a
 * handler that behaves, so its top-level `catch` never fires there). This file
 * targets that seam directly: an exception that escapes the handler must be
 * logged and still end in exit(0) — the literal fail-open invariant.
 */

// A resolved-workspace stand-in for the runtime to pass through to the handler;
// the handler under test ignores its contents.
const CWD = absPath("/home/test/project");
const WORKSPACE: Workspace = {
  id: "primary",
  match: [absPath("/home/test/project")],
  kb: absPath("/home/test/vault-primary"),
  worklogs: absPath("/home/test/vault-primary/_Worklogs"),
  exclude: [],
  indexDb: absPath("/home/test/vault-primary/.ccmem/index.db"),
  matchedPrefix: absPath("/home/test/project"),
};

async function runWith(
  resolveWorkspace: WorkspaceResolver,
  handle: HookHandle,
  logger = makeLoggerFake(),
) {
  const io = makeIoFake();
  const container = makeTestGateways({ stdio: io, logger });
  const service = new HookRuntimeService(
    container,
    new PayloadParser(),
    new HookResultSerializer(),
    resolveWorkspace,
  );
  io.setStdin(JSON.stringify({ cwd: CWD }));
  await service.run("test-hook", handle);
  return { io, logger };
}

describe("HookRuntimeService.run (shared preamble/postamble)", () => {
  test("a handler exception is logged and still exits 0", async () => {
    const { io, logger } = await runWith(
      async () => WORKSPACE,
      () => {
        throw new Error("deliberate handler failure");
      },
    );
    expect(io.written).toEqual([]);
    expect(io.exitCode).toBe(0);
    expect(
      logger.entries.some((entry) =>
        entry.message.includes("deliberate handler failure"),
      ),
    ).toBe(true);
  });

  test("a rejected handler promise is caught, logged, and exits 0", async () => {
    const { io, logger } = await runWith(
      async () => WORKSPACE,
      async () => {
        throw new Error("deliberate async failure");
      },
    );
    expect(io.written).toEqual([]);
    expect(io.exitCode).toBe(0);
    expect(logger.entries.length).toBeGreaterThan(0);
  });

  test("no resolved workspace never calls the handler: silent, exit 0", async () => {
    let handlerCalled = false;
    const { io } = await runWith(
      async () => null,
      async (): Promise<HookResult> => {
        handlerCalled = true;
        return { kind: HookResultKind.Silent };
      },
    );
    expect(handlerCalled).toBe(false);
    expect(io.written).toEqual([]);
    expect(io.exitCode).toBe(0);
  });

  test("a resolved workspace calls the handler and serializes its result", async () => {
    const { io } = await runWith(
      async () => WORKSPACE,
      async (): Promise<HookResult> => ({
        kind: HookResultKind.Context,
        event: HookEvent.SessionStart,
        text: "hello",
      }),
    );
    expect(io.written).toEqual([
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "hello" },
      }),
    ]);
    expect(io.exitCode).toBe(0);
  });
});
