import { makeFsRealAdapter } from "../../../../src/adapters/fsReal.adapter.ts";
import type { Container } from "../../../../src/container.ts";
import type { AbsPath } from "../../../../src/domain/AbsPath.ts";
import { expandPath } from "../../../../src/domain/paths.ts";
import type { Workspace } from "../../../../src/domain/Workspace.ts";
/**
 * Shared setup for P5's index-service integration tests: a REAL vault on disk
 * built by `tests/fixtures/vault.ts`'s `buildFixtureVault` (read-only reuse,
 * per the P5 packet notes) — the exact NOTES/WORKLOGS corpus
 * `tests/test_retrieval.py:27-95` uses, plus a second, unrelated workspace for
 * isolation checks. A real `FileSystem` (`fsReal.adapter.ts`) and a real
 * `bun:sqlite` file back every test built from this: `Db` is never faked
 * (CLAUDE.md), and using the real disk here (rather than the in-memory `fs`
 * fake) means the exact same fixture module backs both this packet's tests
 * and the parity harness.
 */
import {
  buildFixtureVault,
  type FixtureVault,
  type FixtureWorkspace,
} from "../../../fixtures/vault.ts";
import { makeTestContainer } from "../../../helpers/container.ts";
import { createTempDir, type TempDir } from "../../../helpers/tempdir.ts";

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
 * `Container` + two `Workspace`s ready for `services/index/**` calls. Pair
 * with `teardownIndexFixture` in an `afterEach`. */
export function setupIndexFixture(): IndexFixture {
  const tempDir = createTempDir("ccmem-index-fixture");
  // SAFETY: `createTempDir` always returns an absolute, resolved path, and it
  // also doubles as this fixture's sandboxed `$HOME` (`buildFixtureVault`'s
  // own doc comment).
  const home = tempDir.path as AbsPath;
  const vault = buildFixtureVault(tempDir.path);
  const container = makeTestContainer({ fs: makeFsRealAdapter() });
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
