import { describe, expect, test } from "bun:test";

import type { AppContext } from "@/core/base/context.typedefs.ts";
import type { AbsPath } from "@/core/index.ts";
import { joinAbs, registryPath } from "@/core/index.ts";
import { HookEvent } from "@/core/transport/hook/hook.typedefs.ts";
import type { Gateways } from "@/gateways/index.ts";
import {
  AgentTarget,
  InstallErrorKind,
} from "@/modules/installation/install.typedefs.ts";
import { InstallService } from "@/modules/installation/services/install.service.ts";
import { ClaudeCommandService } from "@/modules/installation/steps/claudeCommand/claudeCommand.repository.ts";
import { ManifestService } from "@/modules/installation/steps/manifest/manifest.repository.ts";
import { PiExtensionService } from "@/modules/installation/steps/piExtension/piExtension.repository.ts";
import { SettingsService } from "@/modules/installation/steps/settings/settings.repository.ts";
import { ShimService } from "@/modules/installation/steps/shim/shim.repository.ts";
import { SkillsService } from "@/modules/installation/steps/skills/skills.repository.ts";
import { makeProcFake, type ProcFake } from "@/testing/fakes/procFake.fake.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";

/**
 * `InstallService`'s `install`/`uninstall` orchestration — every scenario
 * here runs against `makeTestGateways`'s in-memory `fs` and a `procFake`,
 * NEVER a real `bun`. See `install.command.test.ts`'s doc comment for why
 * that distinction matters on THIS machine specifically.
 */

// SAFETY: fixed test fixtures, never a real filesystem lookup — matches
// `testGateways.fixture.ts`'s `DEFAULT_HOME`/`DEFAULT_CWD`.
const REPO_ROOT = "/repo" as AbsPath;
// SAFETY: same reasoning as `REPO_ROOT` above.
const OLD_REPO_ROOT = "/old-repo" as AbsPath;
// SAFETY: same reasoning as `REPO_ROOT` above.
const REAL_BUN_PATH = "/usr/local/bin/bun" as AbsPath;

/** Join fixed test literals into an `AbsPath` — every call site below
 * concatenates already-fixed fixtures, never a real filesystem path. */
function fixturePath(...segments: readonly string[]): AbsPath {
  // SAFETY: see the doc comment above.
  return segments.join("") as AbsPath;
}

/**
 * Scripts `which bun`/`readlink -f` to resolve to `REAL_BUN_PATH`, seeds
 * that path into `container.fs` (`resolveBunPath` verifies the resolved
 * path actually exists before trusting it), AND pre-seeds an existing
 * `registry.toml` so `seedRegistry` takes its "already exists, left as-is"
 * branch — every "full apply" scenario below reaches that step and none of
 * them are testing `seed.ts` itself (that's `seed.service.test.ts`'s job).
 */
async function setUpBunResolution(container: Gateways, proc: ProcFake): Promise<void> {
  proc.enqueue({
    kind: "resolve",
    result: { stdout: "/usr/bin/bun\n", stderr: "", exitCode: 0 },
  });
  proc.enqueue({
    kind: "resolve",
    result: { stdout: `${REAL_BUN_PATH}\n`, stderr: "", exitCode: 0 },
  });
  await container.fs.writeFile(REAL_BUN_PATH, "");
  // The pi target copies this bundle; every full install below includes it,
  // from whichever repoRoot that scenario installs.
  await Promise.all(
    [REPO_ROOT, OLD_REPO_ROOT].map((root) =>
      container.fs.writeFile(
        fixturePath(root, "/dist/ccMemoryExtension.js"),
        "pi extension bundle",
      ),
    ),
  );
  await container.fs.writeFile(registryPath(container.env.home()), "");
}

/** A full, real install run against `fs`/`env` already seeded on `base` —
 * used to build a second "rerun" container that shares filesystem + home but
 * gets its OWN scripted `proc`, since a `ProcFake`'s queue is consumed by
 * the run it was built for. */
function rerunGateways(base: Gateways, proc: ProcFake): Gateways {
  return makeTestGateways({ fs: base.fs, env: base.env, proc });
}

/** Wraps an already-built `Gateways` container into an `AppContext` so the
 * new `Service`/`UseCase` constructors can consume it. */
function toContext(container: Gateways): AppContext {
  const ctx = makeAppContext({});
  ctx.gateways = container;
  return ctx;
}

describe("InstallService — install error paths", () => {
  test("refuses when bun isn't on PATH", async () => {
    const proc = makeProcFake();
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 1 } });
    const container = makeTestGateways({ proc });

    const result = await new InstallService(toContext(container)).install({
      repoRoot: REPO_ROOT,
      dryRun: false,
    });

    expect(result).toEqual({ ok: false, error: { kind: InstallErrorKind.BunNotFound } });
  });

  test("refuses an ephemeral/unresolvable bun path", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "/usr/bin/bun\n", stderr: "", exitCode: 0 },
    });
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 1 } });
    const container = makeTestGateways({ proc });

    const result = await new InstallService(toContext(container)).install({
      repoRoot: REPO_ROOT,
      dryRun: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe(InstallErrorKind.BunUnresolvable);
  });

  test("reports a malformed settings.json as SettingsUnreadable rather than throwing", async () => {
    const proc = makeProcFake();
    const container = makeTestGateways({ proc });
    await setUpBunResolution(container, proc);
    await container.fs.writeFile(
      SettingsService.defaultPath(container.env.home()),
      "not json {{{",
    );

    const result = await new InstallService(toContext(container)).install({
      repoRoot: REPO_ROOT,
      dryRun: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe(InstallErrorKind.SettingsUnreadable);
      expect(result.error).toMatchObject({
        message: expect.stringContaining("settings.json"),
      });
    }
  });
});

describe("InstallService — install --dry-run", () => {
  test("writes nothing at all", async () => {
    const proc = makeProcFake();
    const container = makeTestGateways({ proc });
    await setUpBunResolution(container, proc);

    const result = await new InstallService(toContext(container)).install({
      repoRoot: REPO_ROOT,
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.dryRun).toBe(true);
    expect(result.value.actionLines).toContain(
      `would write CLI shim -> ${ShimService.defaultPath(container.env.home())}`,
    );
    expect(
      await container.fs.exists(SettingsService.defaultPath(container.env.home())),
    ).toBe(false);
    expect(await container.fs.exists(ShimService.defaultPath(container.env.home()))).toBe(
      false,
    );
    expect(
      await container.fs.exists(ManifestService.defaultPath(container.env.home())),
    ).toBe(false);
  });
});

describe("InstallService — install full apply", () => {
  test("registers all 5 hooks, writes the shim, and records a manifest", async () => {
    const proc = makeProcFake();
    const container = makeTestGateways({ proc });
    await setUpBunResolution(container, proc);

    const result = await new InstallService(toContext(container)).install({
      repoRoot: REPO_ROOT,
      dryRun: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.actionLines).toContain("hook SessionStart -> session-start");
    expect(await container.fs.exists(ShimService.defaultPath(container.env.home()))).toBe(
      true,
    );
    const manifest = await new ManifestService(toContext(container)).load(
      ManifestService.defaultPath(container.env.home()),
    );
    expect(manifest?.bunPath).toBe(REAL_BUN_PATH);
    expect(manifest?.hookCommands[HookEvent.SessionStart]).toContain(
      "hook session-start",
    );
    expect(manifest?.legacyPurgeDone).toBe(true);

    // The command link must name the FILE inside src/commands — linking the
    // directory would leave Claude Code an unreadable ~/.claude/commands entry.
    const commandTarget = ClaudeCommandService.defaultTargetPath(container.env.home());
    expect(await container.fs.readFile(commandTarget)).toBe(
      fixturePath(REPO_ROOT, "/src/commands/", "ccmemory.md"),
    );
    expect(manifest?.claudeCommands).toEqual([{ name: "ccmemory.md", backedUp: false }]);
  });

  test("re-running twice is idempotent: identical settings.json, no duplicate hook groups", async () => {
    const firstProc = makeProcFake();
    const container = makeTestGateways({ proc: firstProc });
    await setUpBunResolution(container, firstProc);

    const first = await new InstallService(toContext(container)).install({
      repoRoot: REPO_ROOT,
      dryRun: false,
    });
    expect(first.ok).toBe(true);
    const settingsAfterFirst = await container.fs.readFile(
      SettingsService.defaultPath(container.env.home()),
    );

    const secondProc = makeProcFake();
    const secondGateways = rerunGateways(container, secondProc);
    await setUpBunResolution(secondGateways, secondProc);
    const second = await new InstallService(toContext(secondGateways)).install({
      repoRoot: REPO_ROOT,
      dryRun: false,
    });
    expect(second.ok).toBe(true);
    const settingsAfterSecond = await container.fs.readFile(
      SettingsService.defaultPath(container.env.home()),
    );

    expect(settingsAfterSecond).toBe(settingsAfterFirst);
    if (second.ok) {
      // The second run purges exactly the 5 groups the first run
      // registered — no duplicates left behind, nothing orphaned.
      expect(second.value.actionLines).toContain(
        "purged 5 stale cc-memory/legacy hook entries",
      );
    }
  });

  test("preserves a foreign hook (buddy-reroll) across install", async () => {
    const proc = makeProcFake();
    const container = makeTestGateways({ proc });
    await setUpBunResolution(container, proc);
    await container.fs.writeFile(
      SettingsService.defaultPath(container.env.home()),
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  type: "command",
                  command: "npx claude-plan-review stop-gate",
                  timeout: 10,
                },
              ],
            },
          ],
        },
      }),
    );

    const result = await new InstallService(toContext(container)).install({
      repoRoot: REPO_ROOT,
      dryRun: false,
    });
    expect(result.ok).toBe(true);

    const settingsContent = await container.fs.readFile(
      SettingsService.defaultPath(container.env.home()),
    );
    expect(settingsContent).toContain("claude-plan-review");
  });

  test("a moved repo purges the old entries by manifest — no orphans", async () => {
    const firstProc = makeProcFake();
    const container = makeTestGateways({ proc: firstProc });
    await setUpBunResolution(container, firstProc);
    const firstInstall = await new InstallService(toContext(container)).install({
      repoRoot: OLD_REPO_ROOT,
      dryRun: false,
    });
    expect(firstInstall.ok).toBe(true);

    const secondProc = makeProcFake();
    const movedGateways = rerunGateways(container, secondProc);
    await setUpBunResolution(movedGateways, secondProc);
    const secondInstall = await new InstallService(toContext(movedGateways)).install({
      repoRoot: REPO_ROOT,
      dryRun: false,
    });

    expect(secondInstall.ok).toBe(true);
    if (secondInstall.ok) {
      expect(secondInstall.value.actionLines).toContain(
        "purged 5 stale cc-memory/legacy hook entries",
      );
    }
    const settingsContent = await container.fs.readFile(
      SettingsService.defaultPath(container.env.home()),
    );
    expect(settingsContent).not.toContain(OLD_REPO_ROOT);
    expect(settingsContent).toContain(REPO_ROOT);
  });

  test("cleans a legacy (pre-manifest) entry exactly once, not on every subsequent run", async () => {
    const firstProc = makeProcFake();
    const container = makeTestGateways({ proc: firstProc });
    await setUpBunResolution(container, firstProc);
    await container.fs.writeFile(
      SettingsService.defaultPath(container.env.home()),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: "command",
                  command: "/Users/dev/cc-memory/src/hooks/session-start.py",
                  timeout: 10,
                },
              ],
            },
          ],
        },
      }),
    );

    const first = await new InstallService(toContext(container)).install({
      repoRoot: REPO_ROOT,
      dryRun: false,
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.value.actionLines.join("\n")).toContain("purged 1 stale");
    }

    const secondProc = makeProcFake();
    const secondGateways = rerunGateways(container, secondProc);
    await setUpBunResolution(secondGateways, secondProc);
    const second = await new InstallService(toContext(secondGateways)).install({
      repoRoot: REPO_ROOT,
      dryRun: false,
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      // Only our own 5 manifest-tracked groups get purged-and-reregistered
      // the second time — never 6, which would mean the legacy substring
      // rule fired again on our OWN freshly-registered entry.
      expect(second.value.actionLines.join("\n")).toContain("purged 5 stale");
    }
  });
});

describe("InstallService — uninstall", () => {
  test("reports nothing to do when there is no manifest", async () => {
    const container = makeTestGateways({ proc: makeProcFake() });
    const report = await new InstallService(toContext(container)).uninstall();
    expect(report).toEqual({
      uninstalled: false,
      actionLines: ["no installed.json manifest found; nothing to do"],
    });
  });

  test("reverses exactly what the manifest recorded: shim, hooks, manifest", async () => {
    const installProc = makeProcFake();
    const container = makeTestGateways({ proc: installProc });
    await setUpBunResolution(container, installProc);
    const installed = await new InstallService(toContext(container)).install({
      repoRoot: REPO_ROOT,
      dryRun: false,
    });
    expect(installed.ok).toBe(true);

    const uninstallProc = makeProcFake();
    const report = await new InstallService(
      toContext(rerunGateways(container, uninstallProc)),
    ).uninstall();

    expect(report.uninstalled).toBe(true);
    expect(await container.fs.exists(ShimService.defaultPath(container.env.home()))).toBe(
      false,
    );
    expect(
      await container.fs.exists(ManifestService.defaultPath(container.env.home())),
    ).toBe(false);
    const settingsContent = await container.fs.readFile(
      SettingsService.defaultPath(container.env.home()),
    );
    expect(settingsContent).not.toContain("hook session-start");
  });

  test("uninstall preserves a foreign hook it never registered", async () => {
    const installProc = makeProcFake();
    const container = makeTestGateways({ proc: installProc });
    await setUpBunResolution(container, installProc);
    await container.fs.writeFile(
      SettingsService.defaultPath(container.env.home()),
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  type: "command",
                  command: "npx claude-plan-review stop-gate",
                  timeout: 10,
                },
              ],
            },
          ],
        },
      }),
    );
    const installed = await new InstallService(toContext(container)).install({
      repoRoot: REPO_ROOT,
      dryRun: false,
    });
    expect(installed.ok).toBe(true);

    const uninstallProc = makeProcFake();
    const report = await new InstallService(
      toContext(rerunGateways(container, uninstallProc)),
    ).uninstall();
    expect(report.uninstalled).toBe(true);

    const settingsContent = await container.fs.readFile(
      SettingsService.defaultPath(container.env.home()),
    );
    expect(settingsContent).toContain("claude-plan-review");
  });

  test("restores a backed-up skill directory on uninstall", async () => {
    const installProc = makeProcFake();
    const container = makeTestGateways({ proc: installProc });
    await setUpBunResolution(container, installProc);
    const skillsTargetDir = SkillsService.defaultTargetDir(container.env.home());
    const targetPath = fixturePath(skillsTargetDir, "/remember");
    await container.fs.writeFile(
      fixturePath(targetPath, "/SKILL.md"),
      "the real, foreign skill",
    );
    await container.fs.mkdir(fixturePath(REPO_ROOT, "/src/skills/remember"));

    const installed = await new InstallService(toContext(container)).install({
      repoRoot: REPO_ROOT,
      dryRun: false,
    });
    expect(installed.ok).toBe(true);
    expect(
      await container.fs.exists(
        fixturePath(targetPath, ".pre-ccmemory.bak", "/SKILL.md"),
      ),
    ).toBe(true);

    const uninstallProc = makeProcFake();
    const report = await new InstallService(
      toContext(rerunGateways(container, uninstallProc)),
    ).uninstall();
    expect(report.uninstalled).toBe(true);
    expect(await container.fs.exists(fixturePath(targetPath, "/SKILL.md"))).toBe(true);
    expect(await container.fs.readFile(fixturePath(targetPath, "/SKILL.md"))).toBe(
      "the real, foreign skill",
    );
  });
});

describe("InstallService — --agents target selection", () => {
  test("a pi-only install never reads or writes ~/.claude/settings.json", async () => {
    const proc = makeProcFake();
    const container = makeTestGateways({ proc });
    await setUpBunResolution(container, proc);

    const result = await new InstallService(toContext(container)).install({
      repoRoot: REPO_ROOT,
      dryRun: false,
      targets: [AgentTarget.Pi],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.targets).toEqual([AgentTarget.Pi]);
    expect(
      await container.fs.exists(SettingsService.defaultPath(container.env.home())),
    ).toBe(false);
    const manifest = await new ManifestService(toContext(container)).load(
      ManifestService.defaultPath(container.env.home()),
    );
    expect(manifest?.hookCommands).toEqual({});
    expect(manifest?.piExtensionPath).toBe(
      PiExtensionService.defaultPath(container.env.home()),
    );
  });

  test("a claude-only install skips the pi extension copy", async () => {
    const proc = makeProcFake();
    const container = makeTestGateways({ proc });
    await setUpBunResolution(container, proc);

    const result = await new InstallService(toContext(container)).install({
      repoRoot: REPO_ROOT,
      dryRun: false,
      targets: [AgentTarget.ClaudeCode],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.actionLines.join("\n")).not.toContain("pi extension");
    expect(
      await container.fs.exists(PiExtensionService.defaultPath(container.env.home())),
    ).toBe(false);
    expect(
      await container.fs.exists(SettingsService.defaultPath(container.env.home())),
    ).toBe(true);
  });

  test("the default installs both targets and reports them", async () => {
    const proc = makeProcFake();
    const container = makeTestGateways({ proc });
    await setUpBunResolution(container, proc);

    const result = await new InstallService(toContext(container)).install({
      repoRoot: REPO_ROOT,
      dryRun: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.targets).toEqual([AgentTarget.ClaudeCode, AgentTarget.Pi]);
    expect(result.value.actionLines).toContain("agents: claude,pi");
    expect(
      await container.fs.exists(SettingsService.defaultPath(container.env.home())),
    ).toBe(true);
    expect(
      await container.fs.exists(PiExtensionService.defaultPath(container.env.home())),
    ).toBe(true);
  });

  test("uninstall removes a recorded pi extension and its skills", async () => {
    const installProc = makeProcFake();
    const container = makeTestGateways({ proc: installProc });
    await setUpBunResolution(container, installProc);
    await container.fs.mkdir(fixturePath(REPO_ROOT, "/src/skills/remember"));
    const installed = await new InstallService(toContext(container)).install({
      repoRoot: REPO_ROOT,
      dryRun: false,
      targets: [AgentTarget.Pi],
    });
    expect(installed.ok).toBe(true);
    const piSkillsDir = joinAbs(container.env.home(), ".pi", "agent", "skills");
    expect(await container.fs.exists(joinAbs(piSkillsDir, "remember"))).toBe(true);

    const uninstallProc = makeProcFake();
    const report = await new InstallService(
      toContext(rerunGateways(container, uninstallProc)),
    ).uninstall();

    expect(report.uninstalled).toBe(true);
    expect(report.actionLines.join("\n")).toContain("removed pi extension");
    expect(report.actionLines.join("\n")).toContain("removed pi skill remember");
    expect(
      await container.fs.exists(PiExtensionService.defaultPath(container.env.home())),
    ).toBe(false);
  });
});
