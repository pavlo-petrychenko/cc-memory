import { describe, expect, test } from "bun:test";

import type { AbsPath } from "../../../../src/domain/AbsPath.ts";
import { expandPath } from "../../../../src/domain/paths.ts";
import type { Workspace } from "../../../../src/domain/Workspace.ts";
import {
  hasSession,
  isSessionActive,
  killSession,
  spawnConsolidation,
  tmuxAvailable,
} from "../../../../src/services/reflect/session.ts";
import { makeProcFake } from "../../../helpers/fakes/procFake.fake.ts";

// SAFETY: fixed test fixture, mirrors tests/helpers/container.ts's DEFAULT_HOME.
const HOME = "/home/test" as AbsPath;
// SAFETY: bun:sqlite's own in-memory-database identifier, unused by any test
// in this file (`session.ts` never opens a `Db`) but required by `Workspace`.
const IN_MEMORY_DB = ":memory:" as AbsPath;

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  const kb = expandPath("/home/test/kb", HOME);
  const worklogs = expandPath("/home/test/kb/_Worklogs", HOME);
  const projectDir = expandPath("/home/test/project", HOME);
  return {
    id: "primary",
    match: [projectDir],
    kb,
    worklogs,
    exclude: [],
    indexDb: IN_MEMORY_DB,
    matchedPrefix: projectDir,
    ...overrides,
  };
}

const BRIEF_PATH = expandPath(
  "/home/test/kb/_Worklogs/_proposals/_brief-2026-08-14.md",
  HOME,
);

describe("reflect/session tmuxAvailable (bin/reflector.py:205-206)", () => {
  test("true when tmux -V starts successfully", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "tmux 3.4\n", stderr: "", exitCode: 0 },
    });

    expect(await tmuxAvailable(proc)).toBe(true);
  });

  test("false when the spawn itself fails (tmux not on PATH)", async () => {
    const proc = makeProcFake();
    proc.enqueue({ kind: "reject", error: new Error("spawn tmux ENOENT") });

    expect(await tmuxAvailable(proc)).toBe(false);
  });
});

describe("reflect/session hasSession (bin/reflector.py:209-210)", () => {
  test("true on exit 0", async () => {
    const proc = makeProcFake();
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } });

    expect(await hasSession(proc, "cc-consolidate-primary")).toBe(true);
    expect(proc.calls[0]?.args).toEqual(["has-session", "-t", "cc-consolidate-primary"]);
  });

  test("false on a non-zero exit (no such session)", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "", stderr: "can't find session", exitCode: 1 },
    });

    expect(await hasSession(proc, "cc-consolidate-primary")).toBe(false);
  });
});

describe("reflect/session isSessionActive (bin/reflector.py:216-224)", () => {
  const bareShells = [
    "zsh",
    "-zsh",
    "bash",
    "-bash",
    "sh",
    "-sh",
    "fish",
    "-fish",
    "dash",
  ];

  for (const shell of bareShells) {
    test(`a leftover bare shell ("${shell}") is stale, not active`, async () => {
      const proc = makeProcFake();
      proc.enqueue({
        kind: "resolve",
        result: { stdout: `${shell}\n`, stderr: "", exitCode: 0 },
      });

      expect(await isSessionActive(proc, "cc-consolidate-primary")).toBe(false);
    });
  }

  test("a non-shell pane command (claude still running) is active", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "claude\n", stderr: "", exitCode: 0 },
    });

    expect(await isSessionActive(proc, "cc-consolidate-primary")).toBe(true);
  });

  test("an empty/unknown pane command is assumed active, not disturbed", async () => {
    const proc = makeProcFake();
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } });

    expect(await isSessionActive(proc, "cc-consolidate-primary")).toBe(true);
  });

  test("bare-shell matching is case-insensitive", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "ZSH\n", stderr: "", exitCode: 0 },
    });

    expect(await isSessionActive(proc, "cc-consolidate-primary")).toBe(false);
  });
});

describe("reflect/session killSession (bin/reflector.py:300)", () => {
  test("runs kill-session and ignores the result either way", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "", stderr: "boom", exitCode: 1 },
    });

    await killSession(proc, "cc-consolidate-primary");

    expect(proc.calls[0]?.command).toBe("tmux");
    expect(proc.calls[0]?.args).toEqual(["kill-session", "-t", "cc-consolidate-primary"]);
  });
});

describe("reflect/session spawnConsolidation (bin/reflector.py:227-247)", () => {
  test("spawns a detached session in the workspace's first match directory", async () => {
    const proc = makeProcFake();
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } });
    const projectDir = expandPath("/home/test/project", HOME);
    const workspace = makeWorkspace({ match: [projectDir] });

    const result = await spawnConsolidation(
      proc,
      workspace,
      BRIEF_PATH,
      "cc-consolidate-primary",
      "/bin/fish",
      "claude --dangerously-skip-permissions",
    );

    expect(result).toEqual({ ok: true });
    expect(proc.calls).toHaveLength(1);
    const call = proc.calls[0];
    expect(call?.command).toBe("tmux");
    expect(call?.args?.slice(0, 6)).toEqual([
      "new-session",
      "-d",
      "-s",
      "cc-consolidate-primary",
      "-c",
      projectDir,
    ]);
    expect(call?.args?.[6]).toBe("sh");
    expect(call?.args?.[7]).toBe("-c");
    const inner = call?.args?.[8] ?? "";
    // The exact text sent to `claude` (bin/reflector.py:238-243), verbatim.
    expect(inner).toContain(
      "cc-memory consolidation for the primary workspace. Read the brief at " +
        `${BRIEF_PATH} . For each candidate decide ADD, UPDATE, INVALIDATE or NOOP against ` +
        "the existing KB (use memory-search to check). Propose the changes, then apply " +
        "only the ones I approve via the save-learning skill. Do NOT write to the KB " +
        "without my explicit approval. When finished, run memory reindex.",
    );
    expect(inner).toStartWith("claude --dangerously-skip-permissions '");
    expect(inner).toEndWith(
      "echo; echo '[cc-memory consolidation finished -- Ctrl-b d to detach]'; exec /bin/fish",
    );
  });

  test("a non-zero exit yields ok:false with the trimmed stderr", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "", stderr: "  duplicate session: foo  ", exitCode: 1 },
    });

    const result = await spawnConsolidation(
      proc,
      makeWorkspace(),
      BRIEF_PATH,
      "cc-consolidate-primary",
      "/bin/zsh",
      "claude --dangerously-skip-permissions",
    );

    expect(result).toEqual({ ok: false, error: "duplicate session: foo" });
  });

  test("a workspace with no match directory fails without spawning anything", async () => {
    const proc = makeProcFake();
    const workspace = makeWorkspace({ match: [] });

    const result = await spawnConsolidation(
      proc,
      workspace,
      BRIEF_PATH,
      "cc-consolidate-primary",
      "/bin/zsh",
      "claude --dangerously-skip-permissions",
    );

    expect(result).toEqual({ ok: false, error: "workspace has no match directory" });
    expect(proc.calls).toHaveLength(0);
  });
});
