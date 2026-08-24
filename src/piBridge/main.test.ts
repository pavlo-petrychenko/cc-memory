import { describe, expect, test } from "bun:test";

import createCcMemoryExtension from "@/piBridge/main.ts";
import {
  CCMEMORY_DISABLED_NOTICE,
  CCMEMORY_ENABLED_NOTICE,
  CCMEMORY_USAGE_NOTICE,
  TOGGLE_COMMAND_NAME,
} from "@/piBridge/piBridge.constants.ts";
import type {
  HookDispatchPort,
  HookWirePayload,
  PiBeforeAgentStartResult,
  PiCommandContext,
  PiCommandOptions,
  PiEventContext,
  ParsedHookOutput,
  PiEventHandler,
  PiExtensionApi,
} from "@/piBridge/piBridge.typedefs.ts";
import { PiHookName, ParsedHookOutputKind } from "@/piBridge/piBridge.typedefs.ts";

type DispatchCall = {
  readonly hookName: PiHookName;
  readonly payload: HookWirePayload;
};

/** A scripted dispatcher: pops one scripted output per call and records them. */
function makeDispatcher(script: readonly ParsedHookOutput[]) {
  const calls: DispatchCall[] = [];
  const dispatcher: HookDispatchPort = {
    dispatch: async (hookName, payload) => {
      calls.push({ hookName, payload: { ...payload } });
      const next = script[calls.length - 1];
      if (next === undefined) {
        throw new Error(`no scripted output for call ${calls.length}`);
      }
      return next;
    },
  };
  return { dispatcher, calls };
}

function makePi() {
  const registered: [string, PiEventHandler][] = [];
  const commands: [string, PiCommandOptions][] = [];
  const sentMessages: string[] = [];
  const pi: PiExtensionApi = {
    on: (event, handler) => registered.push([event, handler]),
    registerCommand: (name, options) => commands.push([name, options]),
    sendUserMessage: (content) => sentMessages.push(content),
  };
  function handlerOf(name: string): PiEventHandler {
    const found = registered.find(([candidate]) => candidate === name);
    if (found === undefined) throw new Error(`handler '${name}' not registered`);
    return found[1];
  }
  /** Runs the named command with a notify-collecting context; returns the
   * notices in delivery order. */
  async function runCommand(name: string, args = ""): Promise<string[]> {
    const found = commands.find(([candidate]) => candidate === name);
    if (found === undefined) throw new Error(`command '${name}' not registered`);
    const notices: string[] = [];
    const ctx: PiCommandContext = { ui: { notify: (message) => notices.push(message) } };
    await found[1].handler(args, ctx);
    return notices;
  }
  return { pi, handlerOf, runCommand, sentMessages, registered, commands };
}

const CTX: PiEventContext = { cwd: "/repo" };
const SILENT: ParsedHookOutput = { kind: ParsedHookOutputKind.Silent };

function context(text: string): ParsedHookOutput {
  return { kind: ParsedHookOutputKind.Context, text };
}

async function runBeforeAgentStart(
  handler: PiEventHandler,
  prompt: string,
): Promise<PiBeforeAgentStartResult | undefined> {
  const raw = await handler({ prompt }, CTX);
  if (raw === undefined || raw === null) return undefined;
  // SAFETY: the before_agent_start handler only ever returns the inject shape
  // declared on PiEventHandler's result union.
  return raw as PiBeforeAgentStartResult;
}

describe("cc-memory extension wiring", () => {
  test("registers exactly the five lifecycle handlers", () => {
    const { pi, registered } = makePi();
    createCcMemoryExtension(pi);
    expect(registered.map(([name]) => name).toSorted()).toEqual(
      [
        "agent_settled",
        "before_agent_start",
        "session_compact",
        "session_shutdown",
        "session_start",
      ].toSorted(),
    );
  });

  test("the first prompt injects session-start + memory-inject joined in one message", async () => {
    const wired = makePi();
    const dispatched = makeDispatcher([context("KB map"), context("top hits")]);
    createCcMemoryExtension(wired.pi, dispatched.dispatcher);

    const result = await runBeforeAgentStart(
      wired.handlerOf("before_agent_start"),
      "how does the gate work",
    );
    expect(dispatched.calls.map((call) => call.hookName)).toEqual([
      PiHookName.SessionStart,
      PiHookName.MemoryInject,
    ]);
    expect(result?.message).toEqual({
      customType: "cc-memory",
      content: "KB map\n\n---\n\ntop hits",
      display: true,
    });
  });

  test("later prompts inject only memory-inject", async () => {
    const wired = makePi();
    const dispatched = makeDispatcher([
      context("KB map"),
      SILENT,
      context("second hits"),
    ]);
    createCcMemoryExtension(wired.pi, dispatched.dispatcher);
    const handler = wired.handlerOf("before_agent_start");

    await runBeforeAgentStart(handler, "first prompt");
    const second = await runBeforeAgentStart(handler, "second prompt");

    expect(dispatched.calls.map((call) => call.hookName)).toEqual([
      PiHookName.SessionStart,
      PiHookName.MemoryInject,
      PiHookName.MemoryInject,
    ]);
    expect(second?.message).toEqual({
      customType: "cc-memory",
      content: "second hits",
      display: true,
    });
  });

  test("nothing is injected when both dispatches stay silent", async () => {
    const wired = makePi();
    const dispatched = makeDispatcher([SILENT, SILENT]);
    createCcMemoryExtension(wired.pi, dispatched.dispatcher);

    const result = await runBeforeAgentStart(
      wired.handlerOf("before_agent_start"),
      "a plain question",
    );
    expect(result).toBeUndefined();
  });

  test("a block gate is delivered as a follow-up message and the next settle skips re-checking", async () => {
    const wired = makePi();
    const dispatched = makeDispatcher([
      { kind: ParsedHookOutputKind.Block, reason: "write STATE" },
    ]);
    createCcMemoryExtension(wired.pi, dispatched.dispatcher);
    const settled = wired.handlerOf("agent_settled");

    await settled({}, CTX);
    expect(wired.sentMessages).toEqual(["write STATE"]);

    dispatched.calls.length = 0;
    await settled({}, CTX);
    expect(dispatched.calls).toEqual([]);
  });

  test("the message following a gate delivery triggers no memory injection", async () => {
    const wired = makePi();
    const dispatched = makeDispatcher([context("dirty repo nudge")]);
    createCcMemoryExtension(wired.pi, dispatched.dispatcher);

    await wired.handlerOf("agent_settled")({}, CTX);
    const afterGate = await runBeforeAgentStart(
      wired.handlerOf("before_agent_start"),
      "write STATE",
    );

    // Only the wrap-gate ran; the follow-up's own prompt injected nothing.
    expect(dispatched.calls.map((call) => call.hookName)).toEqual([PiHookName.WrapGate]);
    expect(afterGate).toBeUndefined();
  });

  test("a silent gate sends nothing", async () => {
    const wired = makePi();
    const dispatched = makeDispatcher([SILENT]);
    createCcMemoryExtension(wired.pi, dispatched.dispatcher);

    await wired.handlerOf("agent_settled")({}, CTX);
    expect(wired.sentMessages).toEqual([]);
  });

  test("compaction forwards the summary and trigger to compact-checkpoint", async () => {
    const wired = makePi();
    const dispatched = makeDispatcher([SILENT]);
    createCcMemoryExtension(wired.pi, dispatched.dispatcher);

    await wired.handlerOf("session_compact")(
      { compactionEntry: { summary: "did things" }, reason: "manual" },
      CTX,
    );
    expect(dispatched.calls).toEqual([
      {
        hookName: PiHookName.CompactCheckpoint,
        payload: { cwd: "/repo", compact_summary: "did things", trigger: "manual" },
      },
    ]);
  });

  test("an empty compaction summary dispatches nothing", async () => {
    const wired = makePi();
    const dispatched = makeDispatcher([]);
    createCcMemoryExtension(wired.pi, dispatched.dispatcher);

    await wired.handlerOf("session_compact")({ compactionEntry: {} }, CTX);
    expect(dispatched.calls).toEqual([]);
  });

  test("shutdown floors the worklog unless the reason is a reload", async () => {
    const wired = makePi();
    const dispatched = makeDispatcher([SILENT, SILENT]);
    createCcMemoryExtension(wired.pi, dispatched.dispatcher);
    const shutdown = wired.handlerOf("session_shutdown");

    await shutdown({ reason: "reload" }, CTX);
    expect(dispatched.calls).toEqual([]);

    await shutdown({ reason: "quit" }, CTX);
    expect(dispatched.calls).toEqual([
      { hookName: PiHookName.WorklogFloor, payload: { cwd: "/repo", reason: "quit" } },
    ]);
  });

  test("a missing cwd keeps every handler silent", async () => {
    const wired = makePi();
    const dispatched = makeDispatcher([]);
    createCcMemoryExtension(wired.pi, dispatched.dispatcher);
    const noCwd: PiEventContext = {};

    await wired.handlerOf("before_agent_start")({ prompt: "hello there" }, noCwd);
    await wired.handlerOf("agent_settled")({}, noCwd);
    await wired.handlerOf("session_shutdown")({}, noCwd);
    expect(dispatched.calls).toEqual([]);
  });
});

describe("the /ccmemory session toggle", () => {
  test("registers exactly one command, named ccmemory", () => {
    const wired = makePi();
    createCcMemoryExtension(wired.pi);
    expect(wired.commands.map(([name]) => name)).toEqual([TOGGLE_COMMAND_NAME]);
  });

  test("completions filter on/off by prefix, null when nothing matches", () => {
    const wired = makePi();
    createCcMemoryExtension(wired.pi);
    const options = wired.commands[0]?.[1];
    if (options?.getArgumentCompletions === undefined) {
      throw new Error("command has no completions");
    }
    const completions = options.getArgumentCompletions;
    const values = (prefix: string): readonly string[] =>
      completions(prefix)?.map((item) => item.value) ?? [];

    expect(values("")).toEqual(["off", "on"]);
    expect(values("o")).toEqual(["off", "on"]);
    expect(completions("x")).toBeNull();
  });

  test("off silences every dispatch site until on", async () => {
    const wired = makePi();
    const dispatched = makeDispatcher([]); // any unexpected dispatch throws
    createCcMemoryExtension(wired.pi, dispatched.dispatcher);

    await wired.runCommand(TOGGLE_COMMAND_NAME, "off");

    const handler = wired.handlerOf("before_agent_start");
    await handler({ prompt: "first" }, CTX); // no session-start either
    await handler({ prompt: "second" }, CTX);
    await wired.handlerOf("agent_settled")({}, CTX);
    await wired.handlerOf("session_compact")(
      { compactionEntry: { summary: "did things" }, reason: "manual" },
      CTX,
    );
    await wired.handlerOf("session_shutdown")({ reason: "quit" }, CTX);
    expect(dispatched.calls).toEqual([]);
    expect(wired.sentMessages).toEqual([]);
  });

  test("on restores injection, firing a not-yet-fired session start", async () => {
    const wired = makePi();
    const dispatched = makeDispatcher([context("KB map"), context("hits")]);
    createCcMemoryExtension(wired.pi, dispatched.dispatcher);

    await wired.runCommand(TOGGLE_COMMAND_NAME, "off");
    await wired.runCommand(TOGGLE_COMMAND_NAME, "on");
    const result = await runBeforeAgentStart(
      wired.handlerOf("before_agent_start"),
      "back again",
    );

    expect(dispatched.calls.map((call) => call.hookName)).toEqual([
      PiHookName.SessionStart,
      PiHookName.MemoryInject,
    ]);
    expect(result?.message?.content).toBe("KB map\n\n---\n\nhits");
  });

  test("a bare /ccmemory flips and reports the new state", async () => {
    const wired = makePi();
    createCcMemoryExtension(wired.pi);

    expect(await wired.runCommand(TOGGLE_COMMAND_NAME)).toEqual([
      CCMEMORY_DISABLED_NOTICE,
    ]);
    expect(await wired.runCommand(TOGGLE_COMMAND_NAME)).toEqual([
      CCMEMORY_ENABLED_NOTICE,
    ]);
  });

  test("an unrecognized argument reports usage and changes nothing", async () => {
    const wired = makePi();
    const dispatched = makeDispatcher([context("KB map"), context("hits")]);
    createCcMemoryExtension(wired.pi, dispatched.dispatcher);

    expect(await wired.runCommand(TOGGLE_COMMAND_NAME, "banana")).toEqual([
      CCMEMORY_USAGE_NOTICE,
    ]);

    // Still enabled: the next prompt injects as usual.
    await runBeforeAgentStart(wired.handlerOf("before_agent_start"), "real prompt");
    expect(dispatched.calls.map((call) => call.hookName)).toEqual([
      PiHookName.SessionStart,
      PiHookName.MemoryInject,
    ]);
  });

  test("toggling after a gate delivery does not swallow the next real prompt", async () => {
    const wired = makePi();
    const dispatched = makeDispatcher([
      { kind: ParsedHookOutputKind.Block, reason: "write STATE" },
      context("KB map"),
      context("hits"),
    ]);
    createCcMemoryExtension(wired.pi, dispatched.dispatcher);

    await wired.handlerOf("agent_settled")({}, CTX);
    expect(wired.sentMessages).toEqual(["write STATE"]);

    await wired.runCommand(TOGGLE_COMMAND_NAME, "off");
    await wired.runCommand(TOGGLE_COMMAND_NAME, "on");
    await runBeforeAgentStart(wired.handlerOf("before_agent_start"), "my real prompt");

    // The stale suppress flag was cleared: the real prompt injected normally.
    expect(dispatched.calls.map((call) => call.hookName)).toEqual([
      PiHookName.WrapGate,
      PiHookName.SessionStart,
      PiHookName.MemoryInject,
    ]);
  });
});
