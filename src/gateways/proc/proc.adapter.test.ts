import { describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/index.ts";
import { ProcAdapter } from "@/gateways/proc/proc.adapter.ts";

// SAFETY: fixed test fixture — a real, always-present absolute directory.
const TMP = "/tmp" as AbsPath;

describe("proc adapter", () => {
  test("captures stdout, stderr and exit code from a real process", async () => {
    const proc = new ProcAdapter();

    const result = await proc.run("sh", ["-c", "echo out; echo err >&2; exit 3"], {});

    expect(result.stdout).toBe("out\n");
    expect(result.stderr).toBe("err\n");
    expect(result.exitCode).toBe(3);
  });

  test("pipes `input` to the child's stdin", async () => {
    const proc = new ProcAdapter();

    const result = await proc.run("cat", [], { input: "hello from the test" });

    expect(result.stdout).toBe("hello from the test");
  });

  test("runs in the given cwd", async () => {
    const proc = new ProcAdapter();

    const result = await proc.run("pwd", [], { cwd: TMP });

    // macOS's /tmp is itself a symlink into /private/tmp; `pwd` (no -P) prints
    // the logical path as given, so this asserts the argument was honored
    // without asserting away that platform quirk.
    expect(result.stdout.trim().endsWith("/tmp")).toBe(true);
  });

  test("merges `env` additively onto the inherited process environment", async () => {
    const proc = new ProcAdapter();

    const result = await proc.run("sh", ["-c", "echo $HOME/$CCMEM_TEST_VAR"], {
      env: { CCMEM_TEST_VAR: "injected" },
    });

    expect(result.stdout.trim().endsWith(`/injected`)).toBe(true);
    expect(result.stdout.trim()).not.toBe("/injected"); // $HOME was still inherited
  });

  test("rejects when the process outlives its timeout", async () => {
    const proc = new ProcAdapter();

    await expect(proc.run("sleep", ["5"], { timeoutMs: 100 })).rejects.toThrow();
  });

  test("a fast process under its timeout resolves normally", async () => {
    const proc = new ProcAdapter();

    const result = await proc.run("sh", ["-c", "exit 0"], { timeoutMs: 5000 });

    expect(result.exitCode).toBe(0);
  });
});

/**
 * A missing binary must be a RESULT, not an exception: a tool this project shells
 * off macOS and `tmux`/`claude` may not be installed, so a spawn failure must
 * surface as an exit code rather than crash the caller — `memory doctor` needs to
 * keep working instead of crashing mid-command.
 */
describe("a missing binary", () => {
  test("resolves with exit code 127 instead of throwing", async () => {
    const proc = new ProcAdapter();
    const result = await proc.run("cc-memory-no-such-binary-exists", ["--version"], {});

    expect(result.exitCode).toBe(127);
    expect(result.stdout).toBe("");
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});
