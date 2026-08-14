/**
 * True end-to-end coverage of the BUILT artifact: spawn `dist/memory.js`
 * itself (not an in-process function call) against the fixture vault, and
 * assert stdout against a committed golden file under `testing/golden/cli/`,
 * plus real side effects (registry.toml contents, index note count via
 * `notes --json`, a git commit actually created).
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildFixtureVault,
  type FixtureVault,
} from "../testing/fixtures/vault.fixture.ts";
import { ensureDistBuilt } from "../testing/utils/buildDist.utils.ts";
import { normalizeText, runBuiltCli } from "../testing/utils/runCli.utils.ts";
import { createTempDir, type TempDir } from "../testing/utils/tempDir.utils.ts";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;
const GOLDEN_DIR = join(REPO_ROOT, "src", "testing", "golden", "cli");

function readGolden(name: string): string {
  return readFileSync(join(GOLDEN_DIR, `${name}.txt`), "utf-8");
}

function primaryCwd(fixture: FixtureVault): string {
  const workspace = fixture.workspaces.find((candidate) => candidate.id === "primary");
  if (workspace === undefined) throw new Error("fixture has no 'primary' workspace");
  return workspace.projectDir;
}

type Fixture = { readonly tempDir: TempDir; readonly fixture: FixtureVault };

function setUpFixture(): Fixture {
  const tempDir = createTempDir("cli-e2e");
  return { tempDir, fixture: buildFixtureVault(tempDir.path) };
}

describe("CLI e2e against the built dist/memory.js", () => {
  beforeAll(() => {
    ensureDistBuilt();
  });

  test("workspace ls, before any index exists", async () => {
    const { tempDir, fixture } = setUpFixture();
    try {
      const result = await runBuiltCli(["workspace", "ls"], {
        env: fixture.env,
        cwd: fixture.root,
      });
      expect(result.exitCode).toBe(0);
      const normalized = normalizeText(result.stdout, fixture.root)
        .split("\n")
        .toSorted() // row order is not part of the workspace ls output contract
        .join("\n");
      expect(normalized).toBe(readGolden("workspace-ls"));
    } finally {
      tempDir.remove();
    }
  });

  test("resolve inside a workspace", async () => {
    const { tempDir, fixture } = setUpFixture();
    try {
      const result = await runBuiltCli(["resolve"], {
        env: fixture.env,
        cwd: primaryCwd(fixture),
      });
      expect(result.exitCode).toBe(0);
      expect(normalizeText(result.stdout, fixture.root)).toBe(
        readGolden("resolve-inside"),
      );
    } finally {
      tempDir.remove();
    }
  });

  test("resolve outside any workspace", async () => {
    const { tempDir, fixture } = setUpFixture();
    try {
      const result = await runBuiltCli(["resolve"], {
        env: fixture.env,
        cwd: fixture.outsideDir,
      });
      expect(result.exitCode).toBe(0);
      expect(normalizeText(result.stdout, fixture.root)).toBe(
        readGolden("resolve-outside"),
      );
    } finally {
      tempDir.remove();
    }
  });

  test("reindex builds both workspaces' indexes", async () => {
    const { tempDir, fixture } = setUpFixture();
    try {
      const result = await runBuiltCli(["reindex"], {
        env: fixture.env,
        cwd: primaryCwd(fixture),
      });
      expect(result.exitCode).toBe(0);
      const normalized = normalizeText(result.stdout, fixture.root)
        .split("\n")
        .toSorted()
        .join("\n");
      expect(normalized).toBe(readGolden("reindex-all"));
    } finally {
      tempDir.remove();
    }
  });

  test("search returns the expected bullet + snippet shape", async () => {
    const { tempDir, fixture } = setUpFixture();
    try {
      await runBuiltCli(["reindex"], { env: fixture.env, cwd: primaryCwd(fixture) });
      const result = await runBuiltCli(["search", "kryptonite"], {
        env: fixture.env,
        cwd: primaryCwd(fixture),
      });
      expect(result.exitCode).toBe(0);
      expect(normalizeText(result.stdout, fixture.root)).toBe(
        readGolden("search-kryptonite"),
      );
    } finally {
      tempDir.remove();
    }
  });

  test("notes --json is JSON.stringify(rows, null, 2) — the actualize-kb skill's contract", async () => {
    const { tempDir, fixture } = setUpFixture();
    try {
      await runBuiltCli(["reindex"], { env: fixture.env, cwd: primaryCwd(fixture) });
      const result = await runBuiltCli(["notes", "--json"], {
        env: fixture.env,
        cwd: primaryCwd(fixture),
      });
      expect(result.exitCode).toBe(0);
      const rows: readonly { readonly path: string }[] = JSON.parse(result.stdout);
      expect(rows.length).toBeGreaterThan(0); // "index note count" side effect
      expect(normalizeText(result.stdout, fixture.root)).toBe(readGolden("notes-json"));
    } finally {
      tempDir.remove();
    }
  });

  test("commit actually creates a git commit and reports it", async () => {
    const { tempDir, fixture } = setUpFixture();
    try {
      const primary = fixture.workspaces.find((workspace) => workspace.id === "primary");
      if (primary === undefined) throw new Error("fixture has no 'primary' workspace");
      // buildFixtureVault does not itself git-init the kb dir (only each
      // project's git repo) — set one up so `commit` has something to do.
      Bun.spawnSync(["git", "init", "-q"], { cwd: primary.kbDir, env: fixture.env });
      Bun.spawnSync(["git", "add", "-A"], { cwd: primary.kbDir, env: fixture.env });
      Bun.spawnSync(["git", "commit", "-q", "-m", "initial"], {
        cwd: primary.kbDir,
        env: fixture.env,
      });
      Bun.write(
        join(primary.kbDir, "_Worklogs", "wt1", "STATE.md"),
        "# wt1\n## Current focus\nmid-session\n",
      );

      const before = Bun.spawnSync(["git", "-C", primary.kbDir, "log", "--oneline"], {
        env: fixture.env,
      }).stdout.toString();

      const result = await runBuiltCli(["commit", "primary", "-m", "e2e test commit"], {
        env: fixture.env,
        cwd: primaryCwd(fixture),
      });
      expect(result.exitCode).toBe(0);
      expect(normalizeText(result.stdout, fixture.root)).toBe(
        readGolden("commit-with-changes"),
      );

      const after = Bun.spawnSync(["git", "-C", primary.kbDir, "log", "--oneline"], {
        env: fixture.env,
      }).stdout.toString();
      expect(after.split("\n").length).toBeGreaterThan(before.split("\n").length);
      expect(after).toContain("e2e test commit");
    } finally {
      tempDir.remove();
    }
  });

  test("workspace add registers a new workspace and writes registry.toml", async () => {
    const { tempDir, fixture } = setUpFixture();
    try {
      const newProjectDir = join(fixture.root, "projects", "tertiary");
      const result = await runBuiltCli(
        ["workspace", "add", "tertiary", "--match", newProjectDir],
        {
          env: fixture.env,
          cwd: primaryCwd(fixture),
        },
      );
      expect(result.exitCode).toBe(0);
      expect(normalizeText(result.stdout, fixture.root)).toBe(
        readGolden("workspace-add"),
      );

      const registryContents = readFileSync(fixture.registryPath, "utf-8");
      expect(registryContents).toContain('id = "tertiary"');
    } finally {
      tempDir.remove();
    }
  });

  test("hook session-start runs for real against the built artifact (fail-open: exit 0)", async () => {
    const { tempDir, fixture } = setUpFixture();
    try {
      const result = await runBuiltCli(["hook", "session-start"], {
        env: fixture.env,
        cwd: primaryCwd(fixture),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      const parsed: {
        readonly hookSpecificOutput: {
          readonly hookEventName: string;
          readonly additionalContext: string;
        };
      } = JSON.parse(result.stdout);
      expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
      expect(parsed.hookSpecificOutput.additionalContext).toContain(
        "# Obsidian KB index (auto-injected at session start)",
      );
    } finally {
      tempDir.remove();
    }
  });

  test("hook with an unknown name stays fail-open: exit 0, nothing on stdout", async () => {
    const { tempDir, fixture } = setUpFixture();
    try {
      const result = await runBuiltCli(["hook", "not-a-real-hook"], {
        env: fixture.env,
        cwd: primaryCwd(fixture),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("unknown hook name");
    } finally {
      tempDir.remove();
    }
  });

  /**
   * `install` (no `--dry-run`) is DELIBERATELY never spawned here, even
   * against a faked `env.HOME`: the installer writes to real paths:
   * settings.json, the CLI shim and the skills directory, and those are
   * keyed by the REAL system user id, not by `$HOME` — a faked home only
   * protects file writes, not this one. Spawning the real built binary here
   * (rather than calling `install()` in-process with an injected
   * `procFake`, as `tests/cli/commands/install.command.test.ts` does) would
   * genuinely rewrite the real configuration of whatever machine runs this
   * suite. `--dry-run` returns before any of `settings.json`/shim/skills/
   * registry ever get touched, which is what makes it the one
   * `install` invocation this file may safely spawn.
   */
  test("install --dry-run reports success without writing anything", async () => {
    const { tempDir, fixture } = setUpFixture();
    try {
      const result = await runBuiltCli(["install", "--dry-run"], {
        env: fixture.env,
        cwd: primaryCwd(fixture),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("dry run");
    } finally {
      tempDir.remove();
    }
  });

  test("uninstall with nothing installed under the fixture's $HOME reports nothing to do", async () => {
    const { tempDir, fixture } = setUpFixture();
    try {
      const result = await runBuiltCli(["uninstall"], {
        env: fixture.env,
        cwd: primaryCwd(fixture),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("nothing to uninstall");
    } finally {
      tempDir.remove();
    }
  });
});
