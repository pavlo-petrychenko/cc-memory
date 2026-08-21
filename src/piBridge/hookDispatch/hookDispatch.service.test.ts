import { describe, expect, test } from "bun:test";

import { HookDispatchService } from "@/piBridge/hookDispatch/hookDispatch.service.ts";
import type {
  LogPort,
  ProcessSpawnPort,
  SpawnOutcome,
} from "@/piBridge/piBridge.typedefs.ts";
import { PiHookName, ParsedHookOutputKind } from "@/piBridge/piBridge.typedefs.ts";

type SpawnCall = {
  readonly command: string;
  readonly args: readonly string[];
  readonly input: string;
};

function makeSpawn(outcomes: readonly SpawnOutcome[]) {
  const calls: SpawnCall[] = [];
  const spawn: ProcessSpawnPort = async (command, args, options) => {
    const outcome = outcomes[calls.length];
    calls.push({ command, args, input: options.input });
    if (outcome === undefined) throw new Error("spawn not enqueued");
    return outcome;
  };
  return { calls, spawn };
}

function makeLogger() {
  const errors: string[] = [];
  const log: LogPort = (message) => errors.push(message);
  return { errors, log };
}

const BIN = "/usr/local/bin/memory";

/** A spawner that always throws — the binary-missing scenario. */
const failingSpawn: ProcessSpawnPort = async () => {
  throw new Error("binary missing");
};

function makeService(outcomes: readonly SpawnOutcome[]) {
  const spawned = makeSpawn(outcomes);
  const logger = makeLogger();
  const service = new HookDispatchService(BIN, spawned.spawn, logger.log);
  return { service, calls: spawned.calls, errors: logger.errors };
}

describe("HookDispatchService", () => {
  test("spawns '<bin> hook <name>' with the payload as stdin JSON", async () => {
    const { service, calls } = makeService([{ ok: true, stdout: "", stderr: "" }]);
    const result = await service.dispatch(PiHookName.MemoryInject, {
      cwd: "/repo",
      prompt: "how does the gate work",
    });

    expect(result).toEqual({ kind: ParsedHookOutputKind.Silent });
    expect(calls.length).toBe(1);
    expect(calls[0]?.command).toBe(BIN);
    expect(calls[0]?.args).toEqual(["hook", "memory-inject"]);
    expect(JSON.parse(calls[0]?.input ?? "{}")).toEqual({
      cwd: "/repo",
      prompt: "how does the gate work",
    });
  });

  test("a context output is decoded and returned", async () => {
    const stdout = JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "KB map" },
    });
    const { service } = makeService([{ ok: true, stdout, stderr: "" }]);
    const result = await service.dispatch(PiHookName.SessionStart, { cwd: "/repo" });
    expect(result).toEqual({ kind: ParsedHookOutputKind.Context, text: "KB map" });
  });

  test("a block decision passes through to the caller", async () => {
    const stdout = JSON.stringify({ decision: "block", reason: "write the worklog" });
    const { service } = makeService([{ ok: true, stdout, stderr: "" }]);
    const result = await service.dispatch(PiHookName.WrapGate, {
      cwd: "/repo",
      session_id: "s1",
      stop_hook_active: false,
    });
    expect(result).toEqual({
      kind: ParsedHookOutputKind.Block,
      reason: "write the worklog",
    });
  });

  test("a non-zero exit logs and returns null", async () => {
    const { service, errors } = makeService([{ ok: false, stdout: "", stderr: "boom" }]);
    const result = await service.dispatch(PiHookName.WorklogFloor, {
      cwd: "/repo",
      reason: "quit",
    });
    expect(result).toBeNull();
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("worklog-floor");
    expect(errors[0]).toContain("boom");
  });

  test("a thrown spawn failure logs and returns null instead of throwing", async () => {
    const logger = makeLogger();
    const service = new HookDispatchService("/absent/bin", failingSpawn, logger.log);
    const result = await service.dispatch(PiHookName.SessionStart, { cwd: "/repo" });
    expect(result).toBeNull();
    expect(logger.errors[0]).toContain("binary missing");
  });

  test("unparseable stdout of a successful run decodes to Silent without logging", async () => {
    const { service, errors } = makeService([
      { ok: true, stdout: "garbage", stderr: "" },
    ]);
    const result = await service.dispatch(PiHookName.SessionStart, { cwd: "/repo" });
    expect(result).toEqual({ kind: ParsedHookOutputKind.Silent });
    expect(errors).toEqual([]);
  });
});
