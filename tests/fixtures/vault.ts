/**
 * Synthetic vault + registry.toml builder for the parity harness.
 *
 * An 8-note corpus across Alpha/Beta/Gamma exercising camelCase-vs-prose
 * matching, title-vs-body BM25 weighting, adjacent-vs-distant term pairs and
 * a typed `depends_on` relation, plus a SECOND, unrelated workspace so
 * cross-workspace isolation (invariant #2 in CLAUDE.md) is exercised, not
 * just retrieval.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { spawnSync } from "bun";
import { stringify } from "smol-toml";

export type FixtureWorkspace = {
  readonly id: string;
  /** The directory registered as this workspace's `match` prefix. */
  readonly matchPrefix: string;
  /**
   * A real git repo one level below `matchPrefix`, used as the hook/CLI
   * `cwd`. It is nested (not `matchPrefix` itself) so `resolve.slug()`
   * — which prefers the git worktree top over a plain relpath — still
   * resolves to `slug` below: the toplevel of this repo sits exactly one
   * path segment under the (non-repo) match prefix.
   */
  readonly projectDir: string;
  readonly slug: string;
  readonly kbDir: string;
  readonly worklogsDir: string;
  readonly indexDbPath: string;
};

export type FixtureVault = {
  readonly root: string;
  readonly registryPath: string;
  readonly workspaces: readonly FixtureWorkspace[];
  /** A directory under no workspace's match prefix — the "cwd outside any
   * workspace" arm of the hook/CLI payload matrix. */
  readonly outsideDir: string;
  readonly env: Readonly<Record<string, string>>;
};

/**
 * Git identity (+ a FIXED commit date) for every repo this fixture touches.
 * `$HOME` is sandboxed to the fixture root (no real ~/.gitconfig reachable),
 * so both our own setup commands below and the app's own git calls during a
 * case (workspace add's `git init`, `memory commit`, wrap-gate's `git
 * status`/`rev-parse`) need identity supplied via env rather than a config
 * file. The fixed author/committer DATE matters too: without it, two
 * independently-built fixtures (one per side of a parity comparison) commit
 * identical content at two different real timestamps, producing two
 * different commit hashes — and `worklog-floor.py`'s SessionEnd hook writes
 * `git log --oneline` (hash included) straight into a worklog file, which
 * IS content-diffed (unlike `.git/` itself — see tests/helpers/tempdir.ts).
 * A fixed date makes every commit this fixture or the app makes through it
 * fully reproducible.
 */
const GIT_ENV = {
  GIT_AUTHOR_NAME: "cc-memory parity fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "cc-memory parity fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
  GIT_CONFIG_NOSYSTEM: "1",
} as const;

const PRIMARY_NOTES = {
  "Alpha/Alpha.md": `---
type: index
---
# Alpha
> Index for the Alpha feature.
- [[Alpha/Injection Hook|Injection Hook]]
`,
  "Alpha/Injection Hook.md": `---
type: note
importance: 6
---
# Injection Hook
The hook extracts salient tokens and keeps injecting them into the prompt.
Wrap-gate blocking happens on Stop.
`,
  "Alpha/Search Ranking.md": `---
type: note
---
# Search Ranking
BM25 ranking with phrase proximity.

## Related
- depends_on [[Alpha/Injection Hook|Injection Hook]]
`,
  "Alpha/Scoring Camel.md": `---
type: note
---
# Scoring Camel
The overallScore field is an unbounded holistic number.
`,
  "Beta/Title Kryptonite.md": `---
type: note
---
# Kryptonite Handbook
General notes about assorted green minerals and their uses.
`,
  "Beta/Body Kryptonite.md": `---
type: note
---
# Mineral Notes
This document happens to mention kryptonite exactly once in its body text.
`,
  "Gamma/Adjacent.md": `---
type: note
---
# Fast Vehicle
The red car is very fast.
`,
  "Gamma/Apart.md": `---
type: note
---
# Orchard Trip
Red apples are quite tasty and then much later i finally drove a car back home.
`,
} satisfies Readonly<Record<string, string>>;

const PRIMARY_WORKLOGS = {
  "wt1/STATE.md": "# wt1\n## Current focus\nnothing\n",
  "wt1/2026-01-01.md":
    "## 10:00 — incident\n**Changes:** deployment rollback incident on the gateway.\n",
} satisfies Readonly<Record<string, string>>;

// A second, unrelated workspace: a search/inject resolved from `primary`'s
// cwd must never surface this content, and vice versa (CLAUDE.md invariant
// #2 — cwd resolves to exactly one workspace).
const SECONDARY_NOTES = {
  "Widgets/Widget Guide.md": `---
type: note
---
# Widget Guide
Documentation for the gizmo catalog. The onlyinsecondary marker token lives here.
`,
} satisfies Readonly<Record<string, string>>;

const SECONDARY_WORKLOGS = {
  "wt1/STATE.md": "# wt1\n## Current focus\nsecondary workspace only\n",
  "wt1/2026-01-02.md":
    "## 09:00 — setup\n**Changes:** bootstrapped the secondary workspace fixture.\n",
} satisfies Readonly<Record<string, string>>;

function writeVaultFile(baseDir: string, relativePath: string, content: string): void {
  const absolutePath = join(baseDir, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, "utf-8");
}

function runGit(cwd: string, args: readonly string[]): void {
  const result = spawnSync(["git", "-C", cwd, ...args], {
    env: { ...process.env, ...GIT_ENV },
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `fixture setup: git ${args.join(" ")} failed in ${cwd}: ${result.stderr.toString()}`,
    );
  }
}

function initProjectRepo(projectDir: string): void {
  mkdirSync(projectDir, { recursive: true });
  runGit(projectDir, ["init", "-q"]);
  writeFileSync(join(projectDir, "README.md"), "# fixture project\n", "utf-8");
  runGit(projectDir, ["add", "-A"]);
  runGit(projectDir, ["commit", "-q", "-m", "initial commit"]);
}

function buildWorkspace(
  root: string,
  id: string,
  notes: Readonly<Record<string, string>>,
  worklogs: Readonly<Record<string, string>>,
): FixtureWorkspace {
  const matchPrefix = join(root, "projects", id);
  const projectDir = join(matchPrefix, "wt1");
  const kbDir = join(root, `vault-${id}`);
  const worklogsDir = join(kbDir, "_Worklogs");
  const indexDbPath = join(root, ".claude", "memory", id, "index.db");

  initProjectRepo(projectDir);
  for (const [relativePath, content] of Object.entries(notes)) {
    writeVaultFile(kbDir, relativePath, content);
  }
  for (const [relativePath, content] of Object.entries(worklogs)) {
    writeVaultFile(worklogsDir, relativePath, content);
  }
  mkdirSync(dirname(indexDbPath), { recursive: true });

  return { id, matchPrefix, projectDir, slug: "wt1", kbDir, worklogsDir, indexDbPath };
}

/**
 * Build a synthetic vault + registry.toml under `root` (a freshly created
 * temp dir — see tests/helpers/tempdir.ts) and return everything a parity
 * case needs to target it.
 *
 * `root` doubles as the sandboxed `$HOME`: every path cc-memory normally
 * resolves under `~` (the registry, each workspace's index_db) lands inside
 * it, via the returned `env.HOME` — so a case run through this fixture never
 * touches the real `~/.claude`.
 */
export function buildFixtureVault(root: string): FixtureVault {
  const primary = buildWorkspace(root, "primary", PRIMARY_NOTES, PRIMARY_WORKLOGS);
  const secondary = buildWorkspace(
    root,
    "secondary",
    SECONDARY_NOTES,
    SECONDARY_WORKLOGS,
  );
  const workspaces = [primary, secondary];

  const registryPath = join(root, ".claude", "memory", "registry.toml");
  mkdirSync(dirname(registryPath), { recursive: true });
  const registryToml = stringify({
    workspace: workspaces.map((workspace) => ({
      id: workspace.id,
      match: [workspace.matchPrefix],
      kb: workspace.kbDir,
      worklogs: workspace.worklogsDir,
      exclude: ["_Worklogs", "Archive", ".obsidian"],
      index_db: workspace.indexDbPath,
    })),
  });
  writeFileSync(registryPath, registryToml, "utf-8");

  const outsideDir = join(root, "outside");
  mkdirSync(outsideDir, { recursive: true });

  return {
    root,
    registryPath,
    workspaces,
    outsideDir,
    env: {
      HOME: root,
      PATH: process.env["PATH"] ?? "",
      PYTHONDONTWRITEBYTECODE: "1",
      ...GIT_ENV,
    },
  };
}
