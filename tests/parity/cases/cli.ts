/**
 * CLI case table — one entry per invocation shape in the plan doc's
 * "contracts" C3 argument table. Each case is a sequence of steps run in
 * order against ONE fresh fixture (most commands are stateful: `search`
 * needs a prior `reindex`, `commit` needs prior content, etc).
 *
 * `reflect` cases are deliberately restricted to `--headless`: the default
 * (non-headless) path spawns a REAL detached tmux session running
 * `claude --dangerously-skip-permissions` if `tmux` happens to be on this
 * machine's PATH (reflector.py:227-247) — never something a test suite
 * should risk triggering. P8 (Reflector packet) owns thorough, mocked
 * coverage of that path.
 */
import { join } from "node:path";

import type { FixtureVault, FixtureWorkspace } from "../../fixtures/vault.ts";
import type { CliCase, CliStep } from "../harness.ts";

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

function step(args: readonly string[], cwd: (fixture: FixtureVault) => string): CliStep {
  return { buildArgs: () => args, cwd };
}

function noopPrepare(): void {
  // most cases need no extra filesystem setup beyond buildFixtureVault
}

function reindexAllStep(): CliStep {
  return step(["reindex"], primaryCwd);
}

const CASES: readonly CliCase[] = [
  {
    name: "cli/resolve-inside-workspace",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [step(["resolve"], primaryCwd)],
  },
  {
    name: "cli/resolve-outside-workspace",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [step(["resolve"], outsideCwd)],
  },
  {
    name: "cli/resolve-explicit-cwd-argument",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    // run from `root` but pass the secondary project dir as the positional arg
    steps: [
      {
        buildArgs: (fixture) => ["resolve", secondaryCwd(fixture)],
        cwd: (fixture) => fixture.root,
      },
    ],
  },
  {
    name: "cli/workspace-ls-before-any-index",
    orderInsensitiveStdout: true, // row order is not part of the C3 contract
    prepare: noopPrepare,
    steps: [step(["workspace", "ls"], primaryCwd)],
  },
  {
    name: "cli/workspace-add-new",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [
      {
        buildArgs: (fixture) => [
          "workspace",
          "add",
          "tertiary",
          "--match",
          join(fixture.root, "projects", "tertiary"),
        ],
        cwd: primaryCwd,
      },
    ],
  },
  {
    name: "cli/workspace-rm-purge",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [
      {
        buildArgs: (fixture) => [
          "workspace",
          "add",
          "tertiary",
          "--match",
          join(fixture.root, "projects", "tertiary"),
        ],
        cwd: primaryCwd,
      },
      step(["workspace", "rm", "tertiary", "--purge"], primaryCwd),
    ],
  },
  {
    name: "cli/workspace-rm-unregister",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [
      {
        buildArgs: (fixture) => [
          "workspace",
          "add",
          "tertiary",
          "--match",
          join(fixture.root, "projects", "tertiary"),
        ],
        cwd: primaryCwd,
      },
      step(["workspace", "rm", "tertiary"], primaryCwd),
    ],
  },
  {
    name: "cli/workspace-rm-unknown",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [step(["workspace", "rm", "no-such-workspace"], primaryCwd)],
  },
  {
    name: "cli/reindex-all-workspaces",
    orderInsensitiveStdout: true, // one line per workspace, order not contractual
    prepare: noopPrepare,
    steps: [reindexAllStep()],
  },
  {
    name: "cli/reindex-single-workspace-full",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [reindexAllStep(), step(["reindex", "primary", "--full"], primaryCwd)],
  },
  {
    name: "cli/reindex-unknown-workspace",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [step(["reindex", "no-such-workspace"], primaryCwd)],
  },
  {
    name: "cli/search-default-cwd",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [reindexAllStep(), step(["search", "kryptonite"], primaryCwd)],
  },
  {
    name: "cli/search-explicit-workspace-and-cwd",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [
      reindexAllStep(),
      step(["search", "kryptonite", "--workspace", "primary", "--cwd", "/"], outsideCwd),
    ],
  },
  {
    name: "cli/search-worklog-kind",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [
      reindexAllStep(),
      step(["search", "rollback incident gateway", "--worklog"], primaryCwd),
    ],
  },
  {
    name: "cli/search-k-limit",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [reindexAllStep(), step(["search", "kryptonite", "-k", "1"], primaryCwd)],
  },
  {
    name: "cli/search-isolation-primary-blind-to-secondary",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [reindexAllStep(), step(["search", "onlyinsecondary"], primaryCwd)],
  },
  {
    name: "cli/search-isolation-secondary-only",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [reindexAllStep(), step(["search", "onlyinsecondary"], secondaryCwd)],
  },
  {
    name: "cli/search-no-workspace-for-cwd",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [step(["search", "kryptonite"], outsideCwd)],
  },
  {
    name: "cli/notes-json",
    orderInsensitiveStdout: false, // list_notes is itself SQL-sorted by path
    prepare: noopPrepare,
    steps: [reindexAllStep(), step(["notes", "--json"], primaryCwd)],
  },
  {
    name: "cli/notes-folder-filter",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [reindexAllStep(), step(["notes", "--folder", "Alpha"], primaryCwd)],
  },
  {
    name: "cli/notes-plain-listing",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [reindexAllStep(), step(["notes"], secondaryCwd)],
  },
  {
    name: "cli/commit-nothing-to-commit",
    orderInsensitiveStdout: false,
    // buildFixtureVault already commits every workspace's initial content —
    // see tests/fixtures/vault.ts buildWorkspace's `git init` + commit.
    prepare: noopPrepare,
    steps: [step(["commit", "primary"], primaryCwd)],
  },
  {
    name: "cli/commit-with-changes",
    orderInsensitiveStdout: false,
    prepare: (fixture) => {
      const primary = workspaceById(fixture, "primary");
      Bun.write(
        join(primary.kbDir, "_Worklogs", "wt1", "STATE.md"),
        "# wt1\n## Current focus\nmid-session\n",
      );
    },
    steps: [step(["commit", "primary", "-m", "wip"], primaryCwd)],
  },
  {
    name: "cli/reflect-no-candidates-headless",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [step(["reflect", "--workspace", "primary", "--headless"], primaryCwd)],
  },
  {
    name: "cli/reflect-if-due-skips-second-run",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [
      step(["reflect", "--workspace", "primary", "--headless"], primaryCwd),
      step(
        ["reflect", "--workspace", "primary", "--if-due", "--threshold-hours", "20"],
        primaryCwd,
      ),
    ],
  },
  {
    name: "cli/reflect-unknown-workspace",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [
      step(["reflect", "--workspace", "no-such-workspace", "--headless"], primaryCwd),
    ],
  },
  {
    name: "cli/doctor-basic",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [step(["doctor"], primaryCwd)],
  },
  {
    name: "cli/doctor-with-prompt",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [step(["doctor", "--prompt", "how does wrap-gate work"], primaryCwd)],
  },
  {
    name: "cli/doctor-outside-workspace",
    orderInsensitiveStdout: false,
    prepare: noopPrepare,
    steps: [step(["doctor"], outsideCwd)],
  },
];

export const CLI_CASES: readonly CliCase[] = CASES;
