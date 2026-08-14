import type { AbsPath } from "../../core/AbsPath.ts";
import { expandPath } from "../../core/paths.ts";
import type { Workspace } from "../../core/Workspace.ts";
import type { Container } from "../../platform/container.ts";
import { makeFileSystemAdapter } from "../../platform/fileSystem.adapter.ts";
import { createTempDir, type TempDir } from "../utils/tempDir.utils.ts";
import { makeTestContainer } from "./testContainer.fixture.ts";
/**
 * Shared setup for the retrieval integration tests: a REAL vault on disk
 * built by `tests/fixtures/vault.ts`'s `buildFixtureVault`, plus a second,
 * unrelated workspace for isolation checks. A real `FileSystem`
 * (`fileSystem.adapter.ts`) and a real `bun:sqlite` file back every test built
 * from this — `SqlDatabase` is never faked, since FTS5's stemmer, bm25 weighting and
 * `NEAR` semantics are the behavior under test — and using the real disk
 * here (rather than the in-memory `fs` fake) means the same fixture module
 * backs both these tests and the end-to-end tests.
 */
import {
  buildFixtureVault,
  type FixtureVault,
  type FixtureWorkspace,
} from "./vault.fixture.ts";

export type IndexFixture = {
  readonly tempDir: TempDir;
  readonly vault: FixtureVault;
  readonly container: Container;
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

/** Expand a `FixtureWorkspace` (plain absolute strings from `node:fs`) into a
 * real `Workspace` (branded `AbsPath`s) — same registry `exclude` list
 * `buildFixtureVault` writes (`_Worklogs`, `Archive`, `.obsidian`). */
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

/** Build a fresh temp-dir-backed vault + registry and wrap it as a real
 * `Container` + two `Workspace`s ready for `retrieval/**` calls. Pair
 * with `teardownIndexFixture` in an `afterEach`. */
export function setupIndexFixture(): IndexFixture {
  const tempDir = createTempDir("ccmem-index-fixture");
  // SAFETY: `createTempDir` always returns an absolute, resolved path, and it
  // also doubles as this fixture's sandboxed `$HOME` (`buildFixtureVault`'s
  // own doc comment).
  const home = tempDir.path as AbsPath;
  const vault = buildFixtureVault(tempDir.path);
  const container = makeTestContainer({ fs: makeFileSystemAdapter() });
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
