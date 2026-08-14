import { describe, expect, test } from "bun:test";

import type { AbsPath } from "../../../src/core/AbsPath.ts";
import { makeGitCliAdapter } from "../../../src/platform/gitCli.adapter.ts";
import { makeProcFake } from "../../helpers/fakes/procFake.fake.ts";

// SAFETY: fixed test fixture, never a real filesystem lookup.
const CWD = "/repo" as AbsPath;

describe("gitCli adapter — argv and timeouts", () => {
  test("statusPorcelain runs `git -C cwd status --porcelain` with a 5s timeout", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: " M a.md\n", stderr: "", exitCode: 0 },
    });
    const git = makeGitCliAdapter(proc);

    const result = await git.statusPorcelain(CWD);

    expect(result).toBe(" M a.md\n");
    expect(proc.calls).toEqual([
      {
        command: "git",
        args: ["-C", CWD, "status", "--porcelain"],
        options: { timeoutMs: 5000 },
      },
    ]);
  });

  test("revParse runs `git -C cwd rev-parse <...args>` with a 5s timeout", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "deadbeef\n", stderr: "", exitCode: 0 },
    });
    const git = makeGitCliAdapter(proc);

    const result = await git.revParse(CWD, ["--abbrev-ref", "HEAD"]);

    expect(result).toBe("deadbeef\n");
    expect(proc.calls[0]?.args).toEqual(["-C", CWD, "rev-parse", "--abbrev-ref", "HEAD"]);
    expect(proc.calls[0]?.options).toEqual({ timeoutMs: 5000 });
  });

  test("showToplevel runs with a 3s timeout, distinct from revParse", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "/repo\n", stderr: "", exitCode: 0 },
    });
    const git = makeGitCliAdapter(proc);

    await git.showToplevel(CWD);

    expect(proc.calls[0]?.args).toEqual(["-C", CWD, "rev-parse", "--show-toplevel"]);
    expect(proc.calls[0]?.options).toEqual({ timeoutMs: 3000 });
  });

  test("diffStat(staged=false) uses `diff --stat`", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: " 1 file changed\n", stderr: "", exitCode: 0 },
    });
    const git = makeGitCliAdapter(proc);

    await git.diffStat(CWD, false);

    expect(proc.calls[0]?.args).toEqual(["-C", CWD, "diff", "--stat"]);
  });

  test("diffStat(staged=true) uses `diff --cached --stat`", async () => {
    const proc = makeProcFake();
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } });
    const git = makeGitCliAdapter(proc);

    await git.diffStat(CWD, true);

    expect(proc.calls[0]?.args).toEqual(["-C", CWD, "diff", "--cached", "--stat"]);
  });

  test("logOneline builds `-<count>` from the count argument", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "abc123 msg\n", stderr: "", exitCode: 0 },
    });
    const git = makeGitCliAdapter(proc);

    await git.logOneline(CWD, 5);

    expect(proc.calls[0]?.args).toEqual(["-C", CWD, "log", "-5", "--oneline"]);
  });

  test("add runs `git add -- <...paths>` with a 10s timeout", async () => {
    const proc = makeProcFake();
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } });
    const git = makeGitCliAdapter(proc);

    const result = await git.add(CWD, ["_Worklogs/foo.md"]);

    expect(result).toBe(true);
    expect(proc.calls[0]?.args).toEqual(["-C", CWD, "add", "--", "_Worklogs/foo.md"]);
    expect(proc.calls[0]?.options).toEqual({ timeoutMs: 10_000 });
  });

  test("commit runs `git commit -m <message>` with a 10s timeout", async () => {
    const proc = makeProcFake();
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } });
    const git = makeGitCliAdapter(proc);

    const result = await git.commit(CWD, "worklog update");

    expect(result).toBe(true);
    expect(proc.calls[0]?.args).toEqual(["-C", CWD, "commit", "-m", "worklog update"]);
  });
});

describe("gitCli adapter — failure semantics", () => {
  test("a non-zero exit resolves to an empty string, not the process's stdout", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: {
        stdout: "should be discarded",
        stderr: "fatal: not a git repo",
        exitCode: 128,
      },
    });
    const git = makeGitCliAdapter(proc);

    const result = await git.statusPorcelain(CWD);

    expect(result).toBe("");
  });

  test("a rejected Proc.run (timeout/spawn failure) resolves to an empty string too", async () => {
    const proc = makeProcFake();
    proc.enqueue({ kind: "reject", error: new Error("timed out") });
    const git = makeGitCliAdapter(proc);

    const result = await git.revParse(CWD, ["HEAD"]);

    expect(result).toBe("");
  });

  test("add resolves false only when the process itself fails to run", async () => {
    const proc = makeProcFake();
    proc.enqueue({ kind: "reject", error: new Error("timed out") });
    const git = makeGitCliAdapter(proc);

    expect(await git.add(CWD, ["x.md"])).toBe(false);
  });

  test("commit resolves true even on a non-zero exit — a no-op commit is not a failure", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "", stderr: "nothing to commit", exitCode: 1 },
    });
    const git = makeGitCliAdapter(proc);

    expect(await git.commit(CWD, "no-op")).toBe(true);
  });
});
