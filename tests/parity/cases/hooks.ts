/**
 * Hook case table — each of the 5 Claude Code hooks crossed with the payload
 * matrix from the plan doc's "testing" section: happy path, cwd outside any
 * workspace, missing fields, `stop_hook_active`, absent `compact_summary`.
 *
 * Not every axis is meaningful for every hook (e.g. `stop_hook_active` is
 * read only by wrap-gate.py); where an axis is a pure no-op for a given
 * hook, the case still exists but documents that the field is harmlessly
 * ignored, rather than being silently skipped.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { spawnSync } from "bun";

import { HookName } from "../../../src/session/hook.command.ts";
import type { FixtureVault, FixtureWorkspace } from "../../fixtures/vault.ts";
import type { HookCase } from "../harness.ts";
import { HookScript } from "../harness.ts";

/**
 * Maps each Python hook SCRIPT (`HookScript`, `tests/parity/harness.ts`) to
 * the CLI name `memory hook <name>` dispatches to on the TypeScript side
 * (`hook.command.ts`'s `HookName`) — there is no Python precedent for these
 * strings (`tools/install.py`'s own event->script map has no CLI names at
 * all), so this is the one place P7's chosen names and the parity harness's
 * existing per-script fixture table meet.
 */
export const HOOK_SCRIPT_TO_CLI_NAME = {
  [HookScript.SessionStart]: HookName.SessionStart,
  [HookScript.MemoryInject]: HookName.MemoryInject,
  [HookScript.WrapGate]: HookName.WrapGate,
  [HookScript.WorklogFloor]: HookName.WorklogFloor,
  [HookScript.CompactCheckpoint]: HookName.CompactCheckpoint,
} satisfies Readonly<Record<HookScript, HookName>>;

function workspaceById(fixture: FixtureVault, id: string): FixtureWorkspace {
  const workspace = fixture.workspaces.find((candidate) => candidate.id === id);
  if (workspace === undefined) {
    throw new Error(`fixture has no workspace "${id}"`);
  }
  return workspace;
}

const primaryCwd = (fixture: FixtureVault): string =>
  workspaceById(fixture, "primary").projectDir;
const secondaryCwd = (fixture: FixtureVault): string =>
  workspaceById(fixture, "secondary").projectDir;
const outsideCwd = (fixture: FixtureVault): string => fixture.outsideDir;

function noopPrepare(): void {
  // most cases need no extra filesystem setup beyond buildFixtureVault
}

/** Create one untracked file in the primary project repo so `git status
 * --porcelain` reports it as dirty — wrap-gate's trigger condition. */
function dirtyPrimaryProjectRepo(fixture: FixtureVault): void {
  const primary = workspaceById(fixture, "primary");
  writeFileSync(join(primary.projectDir, "scratch.txt"), "work in progress\n", "utf-8");
}

/** Age STATE.md's mtime into the past so it reads as "not refreshed since
 * the last nudge" regardless of how fast the two sides of a comparison run. */
function backdateStateFile(fixture: FixtureVault): void {
  const primary = workspaceById(fixture, "primary");
  const statePath = join(primary.kbDir, "_Worklogs", "wt1", "STATE.md");
  const result = spawnSync(["touch", "-t", "202001010000", statePath]);
  if (result.exitCode !== 0) {
    throw new Error(`failed to backdate ${statePath}: ${result.stderr.toString()}`);
  }
}

const CASES: readonly HookCase[] = [
  // --- session-start.py (SessionStart) -------------------------------------
  {
    name: "hooks/session-start/happy-path",
    hookScript: HookScript.SessionStart,
    requiresIndexBuild: false,
    prepare: noopPrepare,
    invocations: [
      {
        buildPayload: (fixture) => ({
          cwd: primaryCwd(fixture),
          session_id: "s1",
          source: "startup",
        }),
        cwd: primaryCwd,
      },
    ],
  },
  {
    name: "hooks/session-start/cwd-outside-workspace",
    hookScript: HookScript.SessionStart,
    requiresIndexBuild: false,
    prepare: noopPrepare,
    invocations: [
      {
        buildPayload: (fixture) => ({ cwd: outsideCwd(fixture), session_id: "s1" }),
        cwd: outsideCwd,
      },
    ],
  },
  {
    name: "hooks/session-start/missing-fields-falls-back-to-process-cwd",
    hookScript: HookScript.SessionStart,
    requiresIndexBuild: false,
    prepare: noopPrepare,
    invocations: [{ buildPayload: () => ({}), cwd: primaryCwd }],
  },
  {
    name: "hooks/session-start/stop-hook-active-is-ignored",
    hookScript: HookScript.SessionStart,
    requiresIndexBuild: false,
    prepare: noopPrepare,
    invocations: [
      {
        buildPayload: (fixture) => ({
          cwd: primaryCwd(fixture),
          session_id: "s1",
          stop_hook_active: true,
        }),
        cwd: primaryCwd,
      },
    ],
  },
  {
    name: "hooks/session-start/secondary-workspace-isolation",
    hookScript: HookScript.SessionStart,
    requiresIndexBuild: false,
    prepare: noopPrepare,
    invocations: [
      {
        buildPayload: (fixture) => ({ cwd: secondaryCwd(fixture), session_id: "s2" }),
        cwd: secondaryCwd,
      },
    ],
  },

  // --- memory-inject.py (UserPromptSubmit) --------------------------------
  {
    name: "hooks/memory-inject/happy-path",
    hookScript: HookScript.MemoryInject,
    requiresIndexBuild: true,
    prepare: noopPrepare,
    invocations: [
      {
        buildPayload: (fixture) => ({
          cwd: primaryCwd(fixture),
          session_id: "s1",
          prompt: "tell me about the injection hook and wrap-gate blocking",
        }),
        cwd: primaryCwd,
      },
    ],
  },
  {
    name: "hooks/memory-inject/cwd-outside-workspace",
    hookScript: HookScript.MemoryInject,
    requiresIndexBuild: true,
    prepare: noopPrepare,
    invocations: [
      {
        buildPayload: (fixture) => ({
          cwd: outsideCwd(fixture),
          prompt: "tell me about kryptonite handbooks",
        }),
        cwd: outsideCwd,
      },
    ],
  },
  {
    name: "hooks/memory-inject/missing-prompt-field",
    hookScript: HookScript.MemoryInject,
    requiresIndexBuild: true,
    prepare: noopPrepare,
    invocations: [
      { buildPayload: (fixture) => ({ cwd: primaryCwd(fixture) }), cwd: primaryCwd },
    ],
  },
  {
    name: "hooks/memory-inject/prompt-below-min-length",
    hookScript: HookScript.MemoryInject,
    requiresIndexBuild: true,
    prepare: noopPrepare,
    invocations: [
      {
        buildPayload: (fixture) => ({ cwd: primaryCwd(fixture), prompt: "hi" }),
        cwd: primaryCwd,
      },
    ],
  },
  {
    name: "hooks/memory-inject/offtopic-prompt-below-score-floor",
    hookScript: HookScript.MemoryInject,
    requiresIndexBuild: true,
    prepare: noopPrepare,
    invocations: [
      {
        buildPayload: (fixture) => ({
          cwd: primaryCwd(fixture),
          prompt: "quantum entanglement submarine engines",
        }),
        cwd: primaryCwd,
      },
    ],
  },
  {
    name: "hooks/memory-inject/isolation-primary-blind-to-secondary",
    hookScript: HookScript.MemoryInject,
    requiresIndexBuild: true,
    prepare: noopPrepare,
    invocations: [
      {
        buildPayload: (fixture) => ({
          cwd: primaryCwd(fixture),
          prompt: "does the widget guide mention an onlyinsecondary marker token",
        }),
        cwd: primaryCwd,
      },
    ],
  },

  // --- wrap-gate.py (Stop) -------------------------------------------------
  {
    name: "hooks/wrap-gate/happy-path-first-nudge",
    hookScript: HookScript.WrapGate,
    requiresIndexBuild: false,
    prepare: dirtyPrimaryProjectRepo,
    invocations: [
      {
        buildPayload: (fixture) => ({ cwd: primaryCwd(fixture), session_id: "s1" }),
        cwd: primaryCwd,
      },
    ],
  },
  {
    name: "hooks/wrap-gate/cwd-outside-workspace",
    hookScript: HookScript.WrapGate,
    requiresIndexBuild: false,
    prepare: dirtyPrimaryProjectRepo,
    invocations: [
      {
        buildPayload: (fixture) => ({ cwd: outsideCwd(fixture), session_id: "s1" }),
        cwd: outsideCwd,
      },
    ],
  },
  {
    name: "hooks/wrap-gate/missing-session-id-falls-back-to-nosession",
    hookScript: HookScript.WrapGate,
    requiresIndexBuild: false,
    prepare: dirtyPrimaryProjectRepo,
    invocations: [
      { buildPayload: (fixture) => ({ cwd: primaryCwd(fixture) }), cwd: primaryCwd },
    ],
  },
  {
    name: "hooks/wrap-gate/stop-hook-active-is-silent",
    hookScript: HookScript.WrapGate,
    requiresIndexBuild: false,
    prepare: dirtyPrimaryProjectRepo,
    invocations: [
      {
        buildPayload: (fixture) => ({
          cwd: primaryCwd(fixture),
          session_id: "s1",
          stop_hook_active: true,
        }),
        cwd: primaryCwd,
      },
    ],
  },
  {
    name: "hooks/wrap-gate/clean-tree-is-silent",
    hookScript: HookScript.WrapGate,
    requiresIndexBuild: false,
    prepare: noopPrepare, // buildFixtureVault already committed everything: clean tree
    invocations: [
      {
        buildPayload: (fixture) => ({ cwd: primaryCwd(fixture), session_id: "s1" }),
        cwd: primaryCwd,
      },
    ],
  },
  {
    name: "hooks/wrap-gate/escalates-to-block-after-repeat-nudges",
    hookScript: HookScript.WrapGate,
    requiresIndexBuild: false,
    // BLOCK_DRIFT defaults to 5: five untracked files keeps `dirty_count`
    // >= it across both invocations (same work signature -> nudges accrue).
    prepare: (fixture) => {
      const primary = workspaceById(fixture, "primary");
      for (const index of [1, 2, 3, 4, 5]) {
        writeFileSync(join(primary.projectDir, `scratch-${index}.txt`), "wip\n", "utf-8");
      }
      backdateStateFile(fixture);
    },
    invocations: [
      {
        buildPayload: (fixture) => ({ cwd: primaryCwd(fixture), session_id: "s1" }),
        cwd: primaryCwd,
      },
      {
        buildPayload: (fixture) => ({ cwd: primaryCwd(fixture), session_id: "s1" }),
        cwd: primaryCwd,
      },
    ],
  },

  // --- worklog-floor.py (SessionEnd) --------------------------------------
  {
    name: "hooks/worklog-floor/happy-path",
    hookScript: HookScript.WorklogFloor,
    requiresIndexBuild: false,
    prepare: noopPrepare,
    invocations: [
      {
        buildPayload: (fixture) => ({ cwd: primaryCwd(fixture), reason: "exit" }),
        cwd: primaryCwd,
      },
    ],
  },
  {
    name: "hooks/worklog-floor/cwd-outside-workspace",
    hookScript: HookScript.WorklogFloor,
    requiresIndexBuild: false,
    prepare: noopPrepare,
    invocations: [
      { buildPayload: (fixture) => ({ cwd: outsideCwd(fixture) }), cwd: outsideCwd },
    ],
  },
  {
    name: "hooks/worklog-floor/missing-reason-field",
    hookScript: HookScript.WorklogFloor,
    requiresIndexBuild: false,
    prepare: noopPrepare,
    invocations: [
      { buildPayload: (fixture) => ({ cwd: primaryCwd(fixture) }), cwd: primaryCwd },
    ],
  },

  // --- compact-checkpoint.py (PostCompact) --------------------------------
  {
    name: "hooks/compact-checkpoint/happy-path",
    hookScript: HookScript.CompactCheckpoint,
    requiresIndexBuild: false,
    prepare: noopPrepare,
    invocations: [
      {
        buildPayload: (fixture) => ({
          cwd: primaryCwd(fixture),
          compact_summary: "Refactored the wrap-gate escalation signature.",
          trigger: "auto",
        }),
        cwd: primaryCwd,
      },
    ],
  },
  {
    name: "hooks/compact-checkpoint/cwd-outside-workspace",
    hookScript: HookScript.CompactCheckpoint,
    requiresIndexBuild: false,
    prepare: noopPrepare,
    invocations: [
      {
        buildPayload: (fixture) => ({
          cwd: outsideCwd(fixture),
          compact_summary: "should never be written",
        }),
        cwd: outsideCwd,
      },
    ],
  },
  {
    name: "hooks/compact-checkpoint/absent-compact-summary-is-silent",
    hookScript: HookScript.CompactCheckpoint,
    requiresIndexBuild: false,
    prepare: noopPrepare,
    invocations: [
      { buildPayload: (fixture) => ({ cwd: primaryCwd(fixture) }), cwd: primaryCwd },
    ],
  },
];

export const HOOK_CASES: readonly HookCase[] = CASES;
