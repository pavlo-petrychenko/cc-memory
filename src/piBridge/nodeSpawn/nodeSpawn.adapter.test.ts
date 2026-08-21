import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  defaultMemoryBinPath,
  logToStderr,
  nodeSpawn,
} from "@/piBridge/nodeSpawn/nodeSpawn.adapter.ts";
import { MEMORY_BIN_HOME_RELATIVE_PATH } from "@/piBridge/piBridge.constants.ts";

/** Bun evaluates the given snippet — a real child process without a fixture
 * file, so every branch of the adapter runs against a genuine spawn. */
function bunEval(snippet: string): readonly [string, readonly string[]] {
  return [process.execPath, ["-e", snippet]] as const;
}

describe("defaultMemoryBinPath", () => {
  test("joins the home dir with the shim's relative install location", () => {
    expect(defaultMemoryBinPath()).toBe(
      join(homedir(), MEMORY_BIN_HOME_RELATIVE_PATH.slice(2)),
    );
  });
});

describe("nodeSpawn", () => {
  test("a zero exit resolves ok with the child's stdout collected", async () => {
    const [command, args] = bunEval(`process.stdout.write("spawned-ok")`);
    const outcome = await nodeSpawn(command, args, {
      input: "",
      timeoutMs: 10_000,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.stdout).toBe("spawned-ok");
  });

  test("the input option reaches the child's stdin before end", async () => {
    const [command, args] = bunEval("process.stdout.write(await Bun.stdin.text())");
    const outcome = await nodeSpawn(command, args, {
      input: "piped-through",
      timeoutMs: 10_000,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.stdout).toBe("piped-through");
  });

  test("a non-zero exit resolves not-ok while keeping both output streams", async () => {
    const [command, args] = bunEval(
      `process.stdout.write("partial");process.stderr.write("boom");process.exit(3)`,
    );
    const outcome = await nodeSpawn(command, args, {
      input: "",
      timeoutMs: 10_000,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.stdout).toBe("partial");
    expect(outcome.stderr).toBe("boom");
  });

  test("a child exceeding timeoutMs is killed and reports the timeout in stderr", async () => {
    const [command, args] = bunEval(`await new Promise((r) => setTimeout(r, 5_000))`);
    const outcome = await nodeSpawn(command, args, { input: "", timeoutMs: 150 });
    expect(outcome.ok).toBe(false);
    expect(outcome.stderr).toContain("timed out after 150ms");
  });

  test("a command that cannot spawn resolves not-ok with the error message", async () => {
    const outcome = await nodeSpawn("./no-such-binary-here", [], {
      input: "",
      timeoutMs: 10_000,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.stderr.length).toBeGreaterThan(0);
  });

  test("logToStderr prefixes the bridge tag so pi can attribute the line", () => {
    const seen: string[] = [];
    const original = console.error;
    console.error = (message: string) => seen.push(message);
    try {
      logToStderr("hook failed");
    } finally {
      console.error = original;
    }
    expect(seen).toEqual(["[cc-memory] hook failed"]);
  });
});
