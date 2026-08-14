import { describe, expect, test } from "bun:test";

import { CliCommand } from "@/cli/index.ts";
import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { Container } from "@/platform/index.ts";
import { makeDatabaseAdapter } from "@/platform/index.ts";
import type { SqlDatabase } from "@/platform/index.ts";
import { makeIoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeProcFake } from "@/testing/fakes/procFake.fake.ts";
import { makeTestContainer } from "@/testing/fixtures/testContainer.fixture.ts";
import {
  workspaceAdd,
  workspaceLs,
  workspaceRm,
} from "@/workspace/commands/workspace/workspace.command.ts";

// SAFETY: a fixed test fixture, matching tests/helpers/container.ts's DEFAULT_HOME.
const HOME = "/home/test" as AbsPath;
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);

type CliTestFixture = {
  readonly container: Container;
  readonly written: readonly string[];
  readonly procCalls: readonly { readonly args: readonly string[] }[];
};

/**
 * A REAL `bun:sqlite` handle (never a `SqlDatabase` fake — CLAUDE.md), but backed by
 * `:memory:` regardless of the path a caller asks for, keyed by that path so
 * two different workspace ids each still get their OWN isolated database.
 * `workspaceAdd`/`workspaceRm --purge` derive `index_db` from `home` + the
 * workspace id (`~/.claude/memory/<id>/index.db`) rather than accepting an
 * override, so a plain in-memory `Container` (whose `fs` is the memory fake,
 * not the real disk) would otherwise try to open a real SQLite file under a
 * `home` directory that doesn't exist on disk.
 */
function makeInMemoryOnlyOpenDb(): (path: string) => SqlDatabase {
  const handles = new Map<string, SqlDatabase>();
  return (path: string) => {
    const existing = handles.get(path);
    if (existing !== undefined) return existing;
    const db = makeDatabaseAdapter(":memory:");
    handles.set(path, db);
    return db;
  };
}

function makeCliTestFixture(): CliTestFixture {
  const io = makeIoFake();
  const proc = makeProcFake();
  const container = makeTestContainer({
    stdio: io,
    proc,
    openDatabase: makeInMemoryOnlyOpenDb(),
  });
  return { container, written: io.written, procCalls: proc.calls };
}

async function addMate(container: Container) {
  return workspaceAdd(container, {
    command: CliCommand.WorkspaceAdd,
    id: "mate",
    match: ["/repo/mate"],
    kb: null,
    worklogs: null,
    exclude: null,
  });
}

describe("workspaceAdd", () => {
  test("scaffolds the vault, registers the workspace, and prints the added summary", async () => {
    const { container, written, procCalls } = makeCliTestFixture();
    const outcome = await addMate(container);

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
    const { container } = makeCliTestFixture();
    await addMate(container);

    const second = await workspaceAdd(container, {
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
    const { container } = makeCliTestFixture();
    await container.fs.writeFile(REGISTRY_PATH, "not toml [[[");
    const outcome = await addMate(container);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderrMessage).toContain("registry error");
  });
});

describe("workspaceRm", () => {
  test("unregisters without touching the index (no --purge)", async () => {
    const { container } = makeCliTestFixture();
    await addMate(container);
    const outcome = await workspaceRm(container, {
      command: CliCommand.WorkspaceRm,
      id: "mate",
      purge: false,
    });
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    const registryContents = await container.fs.readFile(REGISTRY_PATH);
    expect(registryContents).not.toContain('id = "mate"');
  });

  test("--purge also removes the index file", async () => {
    const { container } = makeCliTestFixture();
    await addMate(container);
    const indexDb = expandPath("~/.claude/memory/mate/index.db", HOME);
    await container.fs.writeFile(indexDb, "fake-sqlite-bytes");
    const outcome = await workspaceRm(container, {
      command: CliCommand.WorkspaceRm,
      id: "mate",
      purge: true,
    });
    expect(outcome.exitCode).toBe(0);
    expect(await container.fs.exists(indexDb)).toBe(false);
  });

  test("an unknown id fails with the exact 'no such workspace' message", async () => {
    const { container } = makeCliTestFixture();
    const outcome = await workspaceRm(container, {
      command: CliCommand.WorkspaceRm,
      id: "ghost",
      purge: false,
    });
    expect(outcome).toEqual({ exitCode: 1, stderrMessage: "no such workspace: ghost" });
  });
});

describe("workspaceLs", () => {
  test("an empty registry prints '(no workspaces)'", async () => {
    const { container, written } = makeCliTestFixture();
    const outcome = await workspaceLs(container);
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(written).toEqual(["(no workspaces)"]);
  });

  test("a workspace with no index file yet reports '?' notes", async () => {
    const { container, written } = makeCliTestFixture();
    await addMate(container);
    // workspaceAdd already built the index (indexing an empty vault) — delete
    // it back out so this exercises the "?" branch specifically.
    const indexDb = expandPath("~/.claude/memory/mate/index.db", HOME);
    await container.fs.remove(indexDb);

    const linesBefore = written.length;
    const outcome = await workspaceLs(container);
    expect(outcome.exitCode).toBe(0);
    expect(written[linesBefore]).toContain("[? notes]");
  });
});
