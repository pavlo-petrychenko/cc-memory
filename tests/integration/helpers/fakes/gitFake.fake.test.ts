import { describe, expect, test } from "bun:test";

import type { AbsPath } from "../../../../src/core/AbsPath.ts";
import { makeGitFake } from "../../../helpers/fakes/gitFake.fake.ts";

// SAFETY: fixed test fixture, never a real filesystem lookup.
const CWD = "/repo" as AbsPath;

describe("gitFake", () => {
  test("defaults every read method to an empty string", async () => {
    const git = makeGitFake();

    expect(await git.statusPorcelain(CWD)).toBe("");
    expect(await git.revParse(CWD, ["HEAD"])).toBe("");
    expect(await git.showToplevel(CWD)).toBe("");
    expect(await git.diffStat(CWD, false)).toBe("");
    expect(await git.logOneline(CWD, 5)).toBe("");
  });

  test("defaults add/commit to true", async () => {
    const git = makeGitFake();

    expect(await git.add(CWD, ["a.md"])).toBe(true);
    expect(await git.commit(CWD, "msg")).toBe(true);
  });

  test("setters override each method's scripted return value", async () => {
    const git = makeGitFake();

    git.setStatusPorcelain(" M a.md\n");
    git.setRevParse("deadbeef");
    git.setShowToplevel("/repo");
    git.setDiffStat(" 1 file changed\n");
    git.setLogOneline("abc123 msg\n");
    git.setAddResult(false);
    git.setCommitResult(false);

    expect(await git.statusPorcelain(CWD)).toBe(" M a.md\n");
    expect(await git.revParse(CWD, ["HEAD"])).toBe("deadbeef");
    expect(await git.showToplevel(CWD)).toBe("/repo");
    expect(await git.diffStat(CWD, true)).toBe(" 1 file changed\n");
    expect(await git.logOneline(CWD, 5)).toBe("abc123 msg\n");
    expect(await git.add(CWD, ["a.md"])).toBe(false);
    expect(await git.commit(CWD, "msg")).toBe(false);
  });

  test("records every call with its method name and cwd", async () => {
    const git = makeGitFake();

    await git.statusPorcelain(CWD);
    await git.add(CWD, ["a.md"]);

    expect(git.calls).toEqual([
      { method: "statusPorcelain", cwd: CWD },
      { method: "add", cwd: CWD },
    ]);
  });
});
