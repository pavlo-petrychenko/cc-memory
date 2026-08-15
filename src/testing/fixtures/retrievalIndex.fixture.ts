import type { AbsPath } from "@/core/index.ts";
import { absPath, expandPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import { FileSystemAdapter } from "@/gateways/index.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";
import {
  buildFixtureVault,
  type FixtureVault,
  type FixtureWorkspace,
} from "@/testing/fixtures/vault.fixture.ts";
import { createTempDir, type TempDir } from "@/testing/utils/tempDir.utils.ts";

/** Shared setup for the retrieval integration tests: a REAL vault on disk, a real
 * `FileSystem` and a real `bun:sqlite` file — `Sqlite` is never faked. */
export type IndexFixture = {
  readonly tempDir: TempDir;
  readonly vault: FixtureVault;
  readonly container: Gateways;
  readonly primary: Workspace;
  readonly secondary: Workspace;
  readonly home: AbsPath;
};

function requireFixtureWorkspace(vault: FixtureVault, id: string): FixtureWorkspace {
  const found = vault.workspaces.find((workspace) => workspace.id === id);
  if (found === undefined) {
    throw new Error(`fixture setup: no workspace with id ${id} — unreachable`);
  }
  return found;
}

function toWorkspace(fixtureWorkspace: FixtureWorkspace, home: AbsPath): Workspace {
  const kb = expandPath(fixtureWorkspace.kbDir, home);
  return {
    id: fixtureWorkspace.id,
    match: [expandPath(fixtureWorkspace.matchPrefix, home)],
    kb,
    worklogs: expandPath(fixtureWorkspace.worklogsDir, home),
    exclude: ["_Worklogs", "Archive", ".obsidian"],
    indexDb: expandPath(fixtureWorkspace.indexDbPath, home),
    matchedPrefix: kb,
  };
}

export function setupIndexFixture(): IndexFixture {
  const tempDir = createTempDir("ccmem-index-fixture");
  const home = absPath(tempDir.path);
  const vault = buildFixtureVault(tempDir.path);
  const container = makeTestGateways({ fs: new FileSystemAdapter() });
  return {
    tempDir,
    vault,
    container,
    primary: toWorkspace(requireFixtureWorkspace(vault, "primary"), home),
    secondary: toWorkspace(requireFixtureWorkspace(vault, "secondary"), home),
    home,
  };
}

export function teardownIndexFixture(fixture: IndexFixture): void {
  fixture.tempDir.remove();
}
