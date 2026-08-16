/**
 * The fail-open invariant: a hook must never break a session. SPAWN each of
 * the 5 hooks through the actual built artifact (`bun dist/memory.js hook
 * <name>`) with the literal input `"not json"` on stdin, and assert exit
 * code 0 with nothing resembling a crash on stderr.
 *
 * Spawned with an isolated, empty `$HOME` (a fresh temp dir, no
 * `registry.toml`) so this never touches the real machine's vault —
 * "not json" resolves to `{}`, which then resolves no workspace regardless,
 * but keeping `HOME` sandboxed means this is true independent of that.
 */
import { beforeAll, describe, expect, test } from "bun:test";

import { HookName } from "@/core/transport/hook/hook.typedefs.ts";
import { ensureDistBuilt } from "@/testing/utils/buildDist.utils.ts";
import { createTempDir } from "@/testing/utils/tempDir.utils.ts";

const REPO_ROOT = new URL("../../../../", import.meta.url).pathname;
const DIST_ENTRYPOINT = `${REPO_ROOT}dist/memory.js`;

describe("fail-open: garbage stdin never crashes a hook", () => {
  beforeAll(() => {
    ensureDistBuilt();
  });

  for (const name of Object.values(HookName)) {
    test(`memory hook ${name} <<< "not json" exits 0 with no crash output`, () => {
      const tempDir = createTempDir(`failopen-${name}`);
      try {
        const result = Bun.spawnSync(["bun", DIST_ENTRYPOINT, "hook", name], {
          env: { HOME: tempDir.path, PATH: process.env["PATH"] ?? "" },
          stdin: Buffer.from("not json"),
          stdout: "pipe",
          stderr: "pipe",
        });
        expect(result.exitCode).toBe(0);
        const stderrText = result.stderr.toString();
        expect(stderrText).not.toContain("Traceback");
        expect(stderrText).not.toContain("Uncaught");
        expect(stderrText).not.toContain("TypeError");
        // `session-start`/`memory-inject` may legitimately emit ONE line of
        // JSON on stdout even for `{}` (session-start's working-memory block
        // is never empty); every hook's stdout is either empty or exactly
        // one line, never a stack trace.
        const stdoutText = result.stdout.toString();
        expect(
          stdoutText.split("\n").filter((line) => line !== "").length,
        ).toBeLessThanOrEqual(1);
      } finally {
        tempDir.remove();
      }
    });
  }

  test("an unknown hook name also exits 0 with no crash output", () => {
    const tempDir = createTempDir("failopen-unknown");
    try {
      const result = Bun.spawnSync(["bun", DIST_ENTRYPOINT, "hook", "not-a-real-hook"], {
        env: { HOME: tempDir.path, PATH: process.env["PATH"] ?? "" },
        stdin: Buffer.from("not json"),
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toBe("");
    } finally {
      tempDir.remove();
    }
  });

  test("completely empty stdin also exits 0 with no crash output", () => {
    const tempDir = createTempDir("failopen-empty");
    try {
      const result = Bun.spawnSync(
        ["bun", DIST_ENTRYPOINT, "hook", HookName.SessionStart],
        {
          env: { HOME: tempDir.path, PATH: process.env["PATH"] ?? "" },
          stdin: Buffer.from(""),
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderr.toString()).toBe("");
    } finally {
      tempDir.remove();
    }
  });
});
