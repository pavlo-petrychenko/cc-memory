import { describe, expect, test } from "bun:test";

import { absPath, HookName } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { HookRuntimeService } from "@/core/transport/hook/hook.runtime.ts";
import type { HookHandle } from "@/core/transport/hook/hook.runtime.ts";
import {
  HookEvent,
  HookResultKind,
  SessionToggleState,
} from "@/core/transport/hook/hook.typedefs.ts";
import type {
  HookResult,
  SessionTogglePort,
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
  options: {
    readonly stdin?: string;
    readonly hookLabel?: string;
    readonly sessionToggle?: SessionTogglePort;
  } = {},
) {
  const io = makeIoFake();
  const container = makeTestGateways({ stdio: io, logger });
  const service = new HookRuntimeService(
    container,
    new PayloadParser(),
    new HookResultSerializer(),
    resolveWorkspace,
    options.sessionToggle ?? alwaysEnabledToggle(),
  );
  io.setStdin(options.stdin ?? JSON.stringify({ cwd: CWD }));
  await service.run(options.hookLabel ?? "test-hook", handle);
  return { io, logger };
}

function alwaysEnabledToggle(): SessionTogglePort {
  return {
    stateFor: () => Promise.resolve(SessionToggleState.Enabled),
    disable: () => Promise.resolve(),
    enable: () => Promise.resolve(),
  };
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

  test("a disabled session marker silences the hook before the handler runs", async () => {
    let handlerCalled = false;
    const toggle: SessionTogglePort = {
      stateFor: (sessionId) => {
        expect(sessionId).toBe("session-abc");
        return Promise.resolve(SessionToggleState.Disabled);
      },
      disable: () => Promise.resolve(),
      enable: () => Promise.resolve(),
    };
    const { io } = await runWith(
      async () => WORKSPACE,
      async (): Promise<HookResult> => {
        handlerCalled = true;
        return { kind: HookResultKind.Silent };
      },
      undefined,
      {
        hookLabel: HookName.MemoryInject,
        stdin: JSON.stringify({ cwd: CWD, session_id: "session-abc", prompt: "hi" }),
        sessionToggle: toggle,
      },
    );
    expect(handlerCalled).toBe(false);
    expect(io.written).toEqual([]);
    expect(io.exitCode).toBe(0);
  });

  test("the worklog floor clears its session's marker while silenced", async () => {
    const cleared: string[] = [];
    const toggle: SessionTogglePort = {
      stateFor: () => Promise.resolve(SessionToggleState.Disabled),
      disable: () => Promise.resolve(),
      enable: (sessionId) => {
        cleared.push(sessionId);
        return Promise.resolve();
      },
    };
    const { io, logger } = await runWith(
      async () => WORKSPACE,
      async (): Promise<HookResult> => ({ kind: HookResultKind.Silent }),
      undefined,
      {
        hookLabel: HookName.WorklogFloor,
        stdin: JSON.stringify({ cwd: CWD, session_id: "session-abc", reason: "quit" }),
        sessionToggle: toggle,
      },
    );
    expect(cleared).toEqual(["session-abc"]);
    expect(io.written).toEqual([]);
    expect(io.exitCode).toBe(0);
    expect(logger.entries.length).toBe(0);
  });

  test("an enabled session runs the handler as usual", async () => {
    let handlerCalled = false;
    const { io } = await runWith(
      async () => WORKSPACE,
      async (): Promise<HookResult> => {
        handlerCalled = true;
        return { kind: HookResultKind.Silent };
      },
      undefined,
      {
        hookLabel: HookName.MemoryInject,
        stdin: JSON.stringify({ cwd: CWD, session_id: "session-abc", prompt: "hi" }),
      },
    );
    expect(handlerCalled).toBe(true);
    expect(io.exitCode).toBe(0);
  });

  test("a failing toggle check fails open to enabled and logs the failure", async () => {
    let handlerCalled = false;
    const toggle: SessionTogglePort = {
      stateFor: () => Promise.reject(new Error("toggle store exploded")),
      disable: () => Promise.resolve(),
      enable: () => Promise.resolve(),
    };
    const { io, logger } = await runWith(
      async () => WORKSPACE,
      async (): Promise<HookResult> => {
        handlerCalled = true;
        return { kind: HookResultKind.Silent };
      },
      undefined,
      {
        hookLabel: HookName.MemoryInject,
        stdin: JSON.stringify({ cwd: CWD, session_id: "session-abc", prompt: "hi" }),
        sessionToggle: toggle,
      },
    );
    expect(handlerCalled).toBe(true);
    expect(io.exitCode).toBe(0);
    expect(
      logger.entries.some((entry) => entry.message.includes("toggle check failed")),
    ).toBe(true);
  });

  test("stdin without a session id skips the toggle entirely", async () => {
    let checkedSessionIds = 0;
    const toggle: SessionTogglePort = {
      stateFor: (_sessionId) => {
        checkedSessionIds += 1;
        return Promise.resolve(SessionToggleState.Enabled);
      },
      disable: () => Promise.resolve(),
      enable: () => Promise.resolve(),
    };
    let handlerCalled = false;
    await runWith(
      async () => WORKSPACE,
      async (): Promise<HookResult> => {
        handlerCalled = true;
        return { kind: HookResultKind.Silent };
      },
      undefined,
      { stdin: JSON.stringify({ cwd: CWD }), sessionToggle: toggle },
    );
    expect(checkedSessionIds).toBe(0);
    expect(handlerCalled).toBe(true);
  });
});
