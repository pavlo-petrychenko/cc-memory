import { describe, expect, test } from "bun:test";

import type { AbsPath } from "../core/AbsPath.ts";
import { makeFsMemoryFake } from "../testing/fakes/fsMemory.fake.ts";
import { makeProcFake } from "../testing/fakes/procFake.fake.ts";
import { BunPathErrorKind, resolveBunPath } from "./bunPath.service.ts";

// SAFETY: fixed test fixture, never a real filesystem lookup.
const REAL_BUN_PATH = "/usr/local/Cellar/bun/1.3.14/bin/bun" as AbsPath;

describe("install/bunPath.ts — readlink -f $(which bun), verified to exist", () => {
  test("resolves and verifies the real binary when both which and readlink succeed", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "/usr/local/bin/bun\n", stderr: "", exitCode: 0 },
    });
    proc.enqueue({
      kind: "resolve",
      result: { stdout: `${REAL_BUN_PATH}\n`, stderr: "", exitCode: 0 },
    });
    const fs = makeFsMemoryFake();
    fs.seedFile(REAL_BUN_PATH, "");

    const result = await resolveBunPath(proc, fs);

    expect(result).toEqual({ ok: true, value: REAL_BUN_PATH });
    expect(proc.calls[0]).toMatchObject({ command: "which", args: ["bun"] });
    expect(proc.calls[1]).toMatchObject({
      command: "readlink",
      args: ["-f", "/usr/local/bin/bun"],
    });
  });

  test("refuses when 'which bun' finds nothing on PATH", async () => {
    const proc = makeProcFake();
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 1 } });
    const fs = makeFsMemoryFake();

    const result = await resolveBunPath(proc, fs);

    expect(result).toEqual({ ok: false, error: { kind: BunPathErrorKind.NotFound } });
  });

  test("refuses when 'which bun' exits 0 but prints nothing", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "   \n", stderr: "", exitCode: 0 },
    });
    const fs = makeFsMemoryFake();

    const result = await resolveBunPath(proc, fs);

    expect(result.ok).toBe(false);
  });

  test("refuses when 'readlink -f' fails (broken symlink chain)", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "/usr/local/bin/bun\n", stderr: "", exitCode: 0 },
    });
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "", stderr: "broken", exitCode: 1 },
    });
    const fs = makeFsMemoryFake();

    const result = await resolveBunPath(proc, fs);

    expect(result).toEqual({
      ok: false,
      error: { kind: BunPathErrorKind.Unresolvable, attemptedPath: "/usr/local/bin/bun" },
    });
  });

  test("refuses an ephemeral path: readlink succeeds but the file doesn't actually exist", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "/usr/local/bin/bun\n", stderr: "", exitCode: 0 },
    });
    proc.enqueue({
      kind: "resolve",
      result: {
        stdout: "/Users/dev/.local/state/fnm_multishells/12345_abc/bin/bun\n",
        stderr: "",
        exitCode: 0,
      },
    });
    const fs = makeFsMemoryFake(); // the "resolved" path was never seeded — doesn't exist

    const result = await resolveBunPath(proc, fs);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe(BunPathErrorKind.Unresolvable);
    }
  });
});
