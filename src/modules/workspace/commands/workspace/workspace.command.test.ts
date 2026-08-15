import { describe, expect, test } from "bun:test";

import { CliCommand } from "@/cli/index.ts";
import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import { SqliteAdapter } from "@/gateways/index.ts";
import type { Sqlite } from "@/gateways/index.ts";
import { WorkspaceCommand } from "@/modules/workspace/commands/workspace/workspace.command.ts";
import { WorkspaceFormatter } from "@/modules/workspace/commands/workspace/workspace.formatter.ts";
import { RegistryTomlSerializer } from "@/modules/workspace/serializers/registryToml/registryToml.serializer.ts";
import { RegistryService } from "@/modules/workspace/services/registry/registry.service.ts";
import { WorkspaceResolverService } from "@/modules/workspace/services/resolver/resolver.service.ts";
import { TargetResolutionService } from "@/modules/workspace/targetResolution/targetResolution.service.ts";
import type { WorkspaceIndexBuilder } from "@/modules/workspace/workspace.typedefs.ts";
import { makeIoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeProcFake } from "@/testing/fakes/procFake.fake.ts";
import {
  makeNoteModule,
  makeSearchIndex,
} from "@/testing/fixtures/retrievalModules.fixture.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";

// SAFETY: a fixed test fixture, matching the test container fixture's DEFAULT_HOME.
const HOME = "/home/test" as AbsPath;
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);

type CliTestFixture = {
  readonly container: Gateways;
  readonly command: WorkspaceCommand;
  readonly written: readonly string[];
  readonly procCalls: readonly { readonly args: readonly string[] }[];
};

/**
 * A REAL `bun:sqlite` handle (never a `Sqlite` fake — CLAUDE.md), but backed by
 * `:memory:` regardless of the path a caller asks for, keyed by that path so
 * two different workspace ids each still get their OWN isolated database.
 * `WorkspaceCommand.add`/`rm --purge` derive `index_db` from `home` + the
 * workspace id (`~/.claude/memory/<id>/index.db`) rather than accepting an
 * override, so a plain in-memory `Gateways` (whose `fs` is the memory fake,
 * not the real disk) would otherwise try to open a real SQLite file under a
 * `home` directory that doesn't exist on disk.
 */
function makeInMemoryOnlyOpenDb(): (path: string) => Sqlite {
  const handles = new Map<string, Sqlite>();
  return (path: string) => {
    const existing = handles.get(path);
    if (existing !== undefined) return existing;
    const db = new SqliteAdapter(":memory:");
    handles.set(path, db);
    return db;
  };
}

/** The real note projection, wrapped as the minimal `WorkspaceIndexBuilder`
 * `WorkspaceCommand` needs — production code never imports `@/modules/note`
 * from `workspace` (that would close the workspace<->note cycle), but a test
 * may cross module boundaries to assemble a scenario. */
function makeIndexBuilder(container: Gateways): WorkspaceIndexBuilder {
  const index = makeSearchIndex(container);
  const note = makeNoteModule(container, index);
  return {
    buildIndex: async (workspace) =>
      (await note.reprojectNotes.run(workspace, { incremental: false })).total,
    noteCount: async (workspace) => (await note.projection.listExisting(workspace)).size,
  };
}

function makeWorkspaceCommand(container: Gateways): WorkspaceCommand {
  const registryService = new RegistryService(container.fs, new RegistryTomlSerializer());
  const resolverService = new WorkspaceResolverService(registryService, container.git);
  const targetResolutionService = new TargetResolutionService(
    registryService,
    resolverService,
  );
  return new WorkspaceCommand(
    container.fs,
    container.env,
    container.proc,
    container.stdio,
    registryService,
    targetResolutionService,
    makeIndexBuilder(container),
    new WorkspaceFormatter(),
  );
}

function makeCliTestFixture(): CliTestFixture {
  const io = makeIoFake();
  const proc = makeProcFake();
  const container = makeTestGateways({
    stdio: io,
    proc,
    openDatabase: makeInMemoryOnlyOpenDb(),
  });
  return {
    container,
    command: makeWorkspaceCommand(container),
    written: io.written,
    procCalls: proc.calls,
  };
}

async function addMate(command: WorkspaceCommand) {
  return command.add({
    command: CliCommand.WorkspaceAdd,
    id: "mate",
    match: ["/repo/mate"],
    kb: null,
    worklogs: null,
    exclude: null,
  });
}

describe("WorkspaceCommand.add", () => {
  test("scaffolds the vault, registers the workspace, and prints the added summary", async () => {
    const { container, command, written, procCalls } = makeCliTestFixture();
    const outcome = await addMate(command);

    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(written[0]).toBe("✓ workspace 'mate' added");
    expect(written.some((line) => line.startsWith("  kb       "))).toBe(true);
    expect(procCalls.some((call) => call.args.includes("init"))).toBe(true);

    // Registered with `~`-relative paths, so the registry stays portable
    // across machines with a different home directory.
    const registryContents = await container.fs.readFile(REGISTRY_PATH);
    expect(registryContents).toContain('id = "mate"');
    expect(registryContents).toContain("~/Documents/Mate Vault");

    // Scaffolding: `.gitignore` and the home note both exist.
    const kb = expandPath("~/Documents/Mate Vault", HOME);
    // SAFETY: `.gitignore`/`Mate.md` are fixed literal segments under an
    // already-absolute, normalized `AbsPath`.
    expect(await container.fs.exists(`${kb}/.gitignore` as AbsPath)).toBe(true);
    // SAFETY: same reasoning as immediately above.
    expect(await container.fs.exists(`${kb}/Mate.md` as AbsPath)).toBe(true);
  });

  test("rejects a workspace whose --match overlaps an existing one", async () => {
    const { command } = makeCliTestFixture();
    await addMate(command);

    const second = await command.add({
      command: CliCommand.WorkspaceAdd,
      id: "personal",
      match: ["/repo/mate/nested"],
      kb: null,
      worklogs: null,
      exclude: null,
    });
    expect(second.exitCode).toBe(1);
    expect(second.stderrMessage).toContain("conflicts");
  });

  test("a present-but-malformed registry is reported, not thrown", async () => {
    const { container, command } = makeCliTestFixture();
    await container.fs.writeFile(REGISTRY_PATH, "not toml [[[");
    const outcome = await addMate(command);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderrMessage).toContain("registry error");
  });
});

describe("WorkspaceCommand.rm", () => {
  test("unregisters without touching the index (no --purge)", async () => {
    const { container, command } = makeCliTestFixture();
    await addMate(command);
    const outcome = await command.rm({
      command: CliCommand.WorkspaceRm,
      id: "mate",
      purge: false,
    });
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    const registryContents = await container.fs.readFile(REGISTRY_PATH);
    expect(registryContents).not.toContain('id = "mate"');
  });

  test("--purge also removes the index file", async () => {
    const { container, command } = makeCliTestFixture();
    await addMate(command);
    const indexDb = expandPath("~/.claude/memory/mate/index.db", HOME);
    await container.fs.writeFile(indexDb, "fake-sqlite-bytes");
    const outcome = await command.rm({
      command: CliCommand.WorkspaceRm,
      id: "mate",
      purge: true,
    });
    expect(outcome.exitCode).toBe(0);
    expect(await container.fs.exists(indexDb)).toBe(false);
  });

  test("an unknown id fails with the exact 'no such workspace' message", async () => {
    const { command } = makeCliTestFixture();
    const outcome = await command.rm({
      command: CliCommand.WorkspaceRm,
      id: "ghost",
      purge: false,
    });
    expect(outcome).toEqual({ exitCode: 1, stderrMessage: "no such workspace: ghost" });
  });
});

describe("WorkspaceCommand.ls", () => {
  test("an empty registry prints '(no workspaces)'", async () => {
    const { command, written } = makeCliTestFixture();
    const outcome = await command.ls();
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(written).toEqual(["(no workspaces)"]);
  });

  test("a workspace with no index file yet reports '?' notes", async () => {
    const { container, command, written } = makeCliTestFixture();
    await addMate(command);
    // add already built the index (indexing an empty vault) — delete it back
    // out so this exercises the "?" branch specifically.
    const indexDb = expandPath("~/.claude/memory/mate/index.db", HOME);
    await container.fs.remove(indexDb);

    const linesBefore = written.length;
    const outcome = await command.ls();
    expect(outcome.exitCode).toBe(0);
    expect(written[linesBefore]).toContain("[? notes]");
  });
});
