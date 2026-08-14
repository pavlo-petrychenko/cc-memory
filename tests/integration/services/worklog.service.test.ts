import { describe, expect, test } from "bun:test";

import type { AbsPath } from "../../../src/domain/AbsPath.ts";
import type { Workspace } from "../../../src/domain/Workspace.ts";
import {
  appendToDated,
  commitWorklogs,
  datedPath,
  ensureDir,
  proposalsDir,
  readState,
  recentEntries,
  statePath,
  worktreeDir,
} from "../../../src/services/worklog.service.ts";
import { makeFsMemoryFake } from "../../helpers/fakes/fsMemory.fake.ts";
import { makeGitFake } from "../../helpers/fakes/gitFake.fake.ts";

// SAFETY: fixed test fixtures, never a real filesystem lookup — same pattern as
// `tests/unit/domain/paths.test.ts`'s `HOME`. Every path literal below is already
// absolute and normalized by construction.
function absPath(raw: string): AbsPath {
  // SAFETY: see the doc comment above.
  return raw as AbsPath;
}

const ws: Workspace = {
  id: "acme",
  match: [absPath("/home/test/Projects/acme")],
  kb: absPath("/home/test/Vaults/Acme"),
  worklogs: absPath("/home/test/Vaults/Acme/_Worklogs"),
  exclude: [],
  indexDb: absPath("/home/test/.claude/memory/acme/index.db"),
  matchedPrefix: absPath("/home/test/Projects/acme"),
};
const slug = "_root";

describe("path helpers", () => {
  test("worktreeDir joins worklogs and slug", () => {
    expect(worktreeDir(ws, slug)).toBe(absPath(`${ws.worklogs}/${slug}`));
  });

  test("statePath is STATE.md inside the worktree dir", () => {
    expect(statePath(ws, slug)).toBe(absPath(`${ws.worklogs}/${slug}/STATE.md`));
  });

  test("datedPath is <date>.md inside the worktree dir", () => {
    expect(datedPath(ws, slug, "2026-08-14")).toBe(
      absPath(`${ws.worklogs}/${slug}/2026-08-14.md`),
    );
  });

  test("proposalsDir is _proposals directly under worklogs", () => {
    expect(proposalsDir(ws)).toBe(absPath(`${ws.worklogs}/_proposals`));
  });
});

describe("ensureDir", () => {
  test("creates the worktree directory and returns its path", async () => {
    const fs = makeFsMemoryFake();
    const dir = await ensureDir(fs, ws, slug);
    expect(dir).toBe(worktreeDir(ws, slug));
    expect(await fs.exists(dir)).toBe(true);
  });
});

describe("readState", () => {
  test("returns the file's contents when STATE.md exists", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(statePath(ws, slug), "# acme — working state\n");
    expect(await readState(fs, ws, slug)).toBe("# acme — working state\n");
  });

  test("returns null when STATE.md doesn't exist", async () => {
    const fs = makeFsMemoryFake();
    expect(await readState(fs, ws, slug)).toBeNull();
  });

  test("returns null when the state path is a directory, not a file", async () => {
    const fs = makeFsMemoryFake();
    fs.seedDir(statePath(ws, slug));
    expect(await readState(fs, ws, slug)).toBeNull();
  });
});

describe("recentEntries", () => {
  test("returns [] when the worktree directory doesn't exist", async () => {
    const fs = makeFsMemoryFake();
    expect(await recentEntries(fs, ws, slug)).toEqual([]);
  });

  test("excludes STATE.md, orders newest-first, and respects the limit", async () => {
    const fs = makeFsMemoryFake();
    const dir = worktreeDir(ws, slug);
    fs.seedFile(absPath(`${dir}/STATE.md`), "current state, not a journal entry");
    fs.seedFile(absPath(`${dir}/2026-08-01.md`), "day one");
    fs.seedFile(absPath(`${dir}/2026-08-02.md`), "day two");
    fs.seedFile(absPath(`${dir}/2026-08-03.md`), "day three");

    const entries = await recentEntries(fs, ws, slug, 2);

    expect(entries).toEqual([
      { date: "2026-08-03", text: "day three" },
      { date: "2026-08-02", text: "day two" },
    ]);
  });

  test("defaults to a limit of 2 (worklog.py:72)", async () => {
    const fs = makeFsMemoryFake();
    const dir = worktreeDir(ws, slug);
    fs.seedFile(absPath(`${dir}/2026-08-01.md`), "one");
    fs.seedFile(absPath(`${dir}/2026-08-02.md`), "two");
    fs.seedFile(absPath(`${dir}/2026-08-03.md`), "three");

    expect(await recentEntries(fs, ws, slug)).toEqual([
      { date: "2026-08-03", text: "three" },
      { date: "2026-08-02", text: "two" },
    ]);
  });

  test("ignores non-.md files in the worktree directory", async () => {
    const fs = makeFsMemoryFake();
    const dir = worktreeDir(ws, slug);
    fs.seedFile(absPath(`${dir}/notes.txt`), "not a journal entry");
    fs.seedFile(absPath(`${dir}/2026-08-01.md`), "day one");

    expect(await recentEntries(fs, ws, slug)).toEqual([
      { date: "2026-08-01", text: "day one" },
    ]);
  });
});

describe("appendToDated", () => {
  test("a brand-new file gets no leading blank line", async () => {
    const fs = makeFsMemoryFake();
    const path = await appendToDated(fs, ws, slug, "2026-08-14", "first entry");
    expect(await fs.readFile(path)).toBe("first entry\n");
  });

  test("appending to a file that already has content adds a blank-line separator", async () => {
    const fs = makeFsMemoryFake();
    const path = await appendToDated(fs, ws, slug, "2026-08-14", "first entry");
    await appendToDated(fs, ws, slug, "2026-08-14", "second entry");
    // Exact byte layout (worklog.py:96's separator quirk, pinned): one blank
    // line between entries, each entry's trailing whitespace stripped and a
    // single newline appended.
    expect(await fs.readFile(path)).toBe("first entry\n\nsecond entry\n");
  });

  test("an existing but EMPTY file gets no leading blank line either", async () => {
    const fs = makeFsMemoryFake();
    const path = datedPath(ws, slug, "2026-08-14");
    await ensureDir(fs, ws, slug);
    fs.seedFile(path, "");
    await appendToDated(fs, ws, slug, "2026-08-14", "first real entry");
    expect(await fs.readFile(path)).toBe("first real entry\n");
  });

  test("trims trailing whitespace off the appended text before the newline", async () => {
    const fs = makeFsMemoryFake();
    const path = await appendToDated(
      fs,
      ws,
      slug,
      "2026-08-14",
      "entry with trailing space   \n\n",
    );
    expect(await fs.readFile(path)).toBe("entry with trailing space\n");
  });

  test("creates the worktree directory if it doesn't exist yet", async () => {
    const fs = makeFsMemoryFake();
    const path = await appendToDated(fs, ws, slug, "2026-08-14", "hello");
    expect(await fs.exists(worktreeDir(ws, slug))).toBe(true);
    expect(path).toBe(datedPath(ws, slug, "2026-08-14"));
  });
});

describe("commitWorklogs", () => {
  test("no-ops outside a git repo (no .git directory under kb)", async () => {
    const fs = makeFsMemoryFake();
    const git = makeGitFake();
    const committed = await commitWorklogs(fs, git, ws, "wrap up session");
    expect(committed).toBe(false);
    expect(git.calls).toEqual([]);
  });

  test("no-ops when .git exists but is a file, not a directory", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(absPath(`${ws.kb}/.git`), "gitdir: /elsewhere/.git\n");
    const git = makeGitFake();
    const committed = await commitWorklogs(fs, git, ws, "wrap up session");
    expect(committed).toBe(false);
    expect(git.calls).toEqual([]);
  });

  test("stages and commits the worklogs directory relative to kb, inside a git repo", async () => {
    const fs = makeFsMemoryFake();
    fs.seedDir(absPath(`${ws.kb}/.git`));
    const git = makeGitFake();
    git.setAddResult(true);
    git.setCommitResult(true);

    const committed = await commitWorklogs(fs, git, ws, "wrap up session");

    expect(committed).toBe(true);
    expect(git.calls).toEqual([
      { method: "add", cwd: ws.kb },
      { method: "commit", cwd: ws.kb },
    ]);
  });

  test("stages correctly even when worklogs is NOT nested under kb (needs a '..' segment)", async () => {
    const siblingWs: Workspace = {
      ...ws,
      kb: absPath("/home/test/Vaults/Acme/Sub"),
      worklogs: absPath("/home/test/Vaults/AcmeWorklogs"),
    };
    const fs = makeFsMemoryFake();
    fs.seedDir(absPath(`${siblingWs.kb}/.git`));
    const git = makeGitFake();
    git.setAddResult(true);
    git.setCommitResult(true);

    expect(await commitWorklogs(fs, git, siblingWs, "wrap up session")).toBe(true);
  });

  test("returns true even when commit itself exits non-zero (nothing staged, worklog.py:111)", async () => {
    const fs = makeFsMemoryFake();
    fs.seedDir(absPath(`${ws.kb}/.git`));
    const git = makeGitFake();
    git.setAddResult(true);
    git.setCommitResult(true); // `Git.commit` resolves true whenever it RAN
    expect(await commitWorklogs(fs, git, ws, "no-op commit")).toBe(true);
  });

  test("returns false and skips commit when add itself fails to run", async () => {
    const fs = makeFsMemoryFake();
    fs.seedDir(absPath(`${ws.kb}/.git`));
    const git = makeGitFake();
    git.setAddResult(false);

    const committed = await commitWorklogs(fs, git, ws, "wrap up session");

    expect(committed).toBe(false);
    expect(git.calls).toEqual([{ method: "add", cwd: ws.kb }]);
  });

  test("returns false when commit fails to run after a successful add", async () => {
    const fs = makeFsMemoryFake();
    fs.seedDir(absPath(`${ws.kb}/.git`));
    const git = makeGitFake();
    git.setAddResult(true);
    git.setCommitResult(false);

    expect(await commitWorklogs(fs, git, ws, "wrap up session")).toBe(false);
  });
});
