import { describe, expect, test } from "bun:test";

import { CliCommand } from "@/cli/index.ts";
import type { AbsPath } from "@/core/index.ts";
import {
  InstallCommand,
  UninstallCommand,
} from "@/install/commands/install/install.command.ts";
import type { Container } from "@/platform/index.ts";
import type { ProcFake } from "@/testing/fakes/procFake.fake.ts";
import { makeProcFake } from "@/testing/fakes/procFake.fake.ts";
import { makeTestContainer } from "@/testing/fixtures/testContainer.fixture.ts";
import { defaultRegistryPath } from "@/workspace/index.ts";

/**
 * `InstallCommand`/`UninstallCommand`
 * (`src/install/commands/install/install.command.ts`) ALWAYS get an explicit
 * fake `Container` here — never the real default `main.ts` uses in
 * production. `InstallService`'s `install`/`uninstall` write to real paths
 * through the injected ports; on the real container that is a REAL mutation
 * of this machine, which a test must never trigger. `procFake` records
 * every call instead of spawning anything, so every assertion below is about
 * what THIS command decided to do, not about the real OS.
 */

// SAFETY: fixed test fixtures, never a real filesystem lookup — same
// reasoning `tests/helpers/container.ts`'s `DEFAULT_HOME` documents.
const REAL_BUN_PATH = "/usr/local/bin/bun" as AbsPath;

/** The shim path install/uninstall write, under a test container's fake
 * `$HOME`. */
function shimPathFor(container: Container): AbsPath {
  // SAFETY: same reasoning as `REAL_BUN_PATH` above — built from a fixed
  // fake `$HOME`, never a real path.
  return `${container.env.home()}/.local/bin/memory` as AbsPath;
}

/**
 * `InstallService.install` seeds `registry.toml` from
 * `<repoRoot>/registry.example.toml` when absent (`seed.service.ts`) —
 * under `bun test` (unbundled), `InstallCommand`'s `repoRootFromRunningFile()`
 * resolves to a path with no such example file at all (see that function's
 * doc comment: it is only correct for the BUNDLED artifact). Pre-seeding a
 * registry here takes that codepath's "already exists, left as-is" branch
 * instead, matching what a real second install run looks like anyway.
 */
async function seedExistingRegistry(container: Container): Promise<void> {
  await container.fs.writeFile(defaultRegistryPath(container.env.home()), "");
}

function scriptedBunProc(): ProcFake {
  const proc = makeProcFake();
  proc.enqueue({
    kind: "resolve",
    result: { stdout: "/usr/bin/bun\n", stderr: "", exitCode: 0 },
  });
  proc.enqueue({
    kind: "resolve",
    result: { stdout: `${REAL_BUN_PATH}\n`, stderr: "", exitCode: 0 },
  });
  return proc;
}

describe("install command (fake container — never the real default)", () => {
  test("install writes the shim and reports success", async () => {
    const proc = scriptedBunProc();
    const container = makeTestContainer({ proc });
    await container.fs.writeFile(REAL_BUN_PATH, "");
    await seedExistingRegistry(container);

    const outcome = await new InstallCommand(container).execute({
      command: CliCommand.Install,
      dryRun: false,
    });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.stderrMessage).toBeNull();
    const shimPath = shimPathFor(container);
    expect(await container.fs.exists(shimPath)).toBe(true);
  });

  test("install --dry-run writes nothing", async () => {
    const proc = scriptedBunProc();
    const container = makeTestContainer({ proc });
    await container.fs.writeFile(REAL_BUN_PATH, "");

    const outcome = await new InstallCommand(container).execute({
      command: CliCommand.Install,
      dryRun: true,
    });

    expect(outcome.exitCode).toBe(0);
    const shimPath = shimPathFor(container);
    expect(await container.fs.exists(shimPath)).toBe(false);
  });

  test("install fails loudly (never writes anything) when bun can't be found", async () => {
    const proc = makeProcFake();
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 1 } });
    const container = makeTestContainer({ proc });

    const outcome = await new InstallCommand(container).execute({
      command: CliCommand.Install,
      dryRun: false,
    });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderrMessage).toContain("bun not found");
    const shimPath = shimPathFor(container);
    expect(await container.fs.exists(shimPath)).toBe(false);
  });

  test("uninstall with no prior install reports nothing to do", async () => {
    const container = makeTestContainer({ proc: makeProcFake() });
    const outcome = await new UninstallCommand(container).execute();
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stderrMessage).toBeNull();
  });

  test("install then uninstall removes the shim it wrote", async () => {
    const proc = scriptedBunProc();
    const container = makeTestContainer({ proc });
    await container.fs.writeFile(REAL_BUN_PATH, "");
    await seedExistingRegistry(container);
    await new InstallCommand(container).execute({
      command: CliCommand.Install,
      dryRun: false,
    });
    const shimPath = shimPathFor(container);
    expect(await container.fs.exists(shimPath)).toBe(true);

    const outcome = await new UninstallCommand(container).execute();

    expect(outcome.exitCode).toBe(0);
    expect(await container.fs.exists(shimPath)).toBe(false);
  });
});
