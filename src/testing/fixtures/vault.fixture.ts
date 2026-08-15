/** Synthetic vault + registry.toml builder for tests that need a real vault on disk:
 * an 8-note corpus exercising camelCase-vs-prose matching, BM25 weighting, term
 * pairs and a typed relation, plus a second workspace for isolation (invariant #2). */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { spawnSync } from "bun";
import { stringify } from "smol-toml";

export type FixtureWorkspace = {
  readonly id: string;
  /** The directory registered as this workspace's `match` prefix. */
  readonly matchPrefix: string;
  /** A real git repo one level below `matchPrefix`, used as the hook/CLI `cwd` — nested
   * so a worktree-slug resolution that prefers the git toplevel still resolves to
   * `slug` below. */
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
  /** A directory under no workspace's match prefix. */
  readonly outsideDir: string;
  readonly env: Readonly<Record<string, string>>;
};

/** Git identity + a FIXED commit date, so hashes stay reproducible — a worklog
 * file's `git log --oneline` line is content-diffed by tests. */
const GIT_ENV = {
  GIT_AUTHOR_NAME: "cc-memory test fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "cc-memory test fixture",
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

/** `root` doubles as the sandboxed `$HOME` (via the returned `env.HOME`), so a case
 * run through this fixture never touches the real `~/.claude`. */
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
