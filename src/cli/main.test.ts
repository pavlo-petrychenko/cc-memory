import { describe, expect, test } from "bun:test";

import { runCli } from "@/cli/main.ts";
import { LogLevel } from "@/core/index.ts";
import { SqliteAdapter } from "@/gateways/index.ts";
import type { Sqlite } from "@/gateways/index.ts";
import { UninstallCommand } from "@/modules/installation/index.ts";
import { makeIoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";

/** Same rationale as `src/workspace/commands/workspace/workspace.command.test.ts`'s
 * helper of the same name: `workspace add`/`workspace rm --purge` derive `index_db` from `home` +
 * the workspace id rather than accepting an override, so a plain in-memory
 * `Gateways` needs its `openDatabase` redirected to `:memory:` to avoid trying to
 * open a real SQLite file under a `home` that doesn't exist on disk — never a
 * `Sqlite` fake (CLAUDE.md), still the real `bun:sqlite` engine. */
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

const CONFIG = {
  injectMinScore: 0.2,
  linkBoost: 0.003,
  injectLogEnabled: true,
  blockAfter: 2,
  blockDrift: 5,
  gateDisabled: false,
  logLevel: LogLevel.Warn,
};

/**
 * `runCli` dispatch coverage — one case per `CliCommand` member, using the
 * cheapest args/state that reaches each command function. Behavior itself is
 * covered exhaustively by each `commands/*.test.ts`; this file only proves
 * the dispatch switch actually wires every command to its function.
 */
describe("runCli dispatch", () => {
  test("a parse failure maps to exit code 2 with the parser's message on stderr", async () => {
    const container = makeTestGateways({ stdio: makeIoFake() });
    const outcome = await runCli(["frobnicate"], container, CONFIG);
    expect(outcome.exitCode).toBe(2);
    expect(outcome.stderrMessage).toContain("unknown command");
  });

  test("workspace add dispatches to workspaceAdd", async () => {
    const io = makeIoFake();
    const container = makeTestGateways({
      stdio: io,
      openDatabase: makeInMemoryOnlyOpenDb(),
    });
    const outcome = await runCli(
      ["workspace", "add", "mate", "--match", "/repo/mate"],
      container,
      CONFIG,
    );
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written[0]).toBe("✓ workspace 'mate' added");
  });

  test("workspace rm dispatches to workspaceRm", async () => {
    const io = makeIoFake();
    const openDatabase = makeInMemoryOnlyOpenDb();
    const addGateways = makeTestGateways({ stdio: io, openDatabase });
    await runCli(
      ["workspace", "add", "mate", "--match", "/repo/mate"],
      addGateways,
      CONFIG,
    );

    const rmGateways = makeTestGateways({
      fs: addGateways.fs,
      stdio: io,
      openDatabase,
    });
    const outcome = await runCli(["workspace", "rm", "mate"], rmGateways, CONFIG);
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
  });

  test("workspace ls dispatches to workspaceLs", async () => {
    const io = makeIoFake();
    const container = makeTestGateways({ stdio: io });
    const outcome = await runCli(["workspace", "ls"], container, CONFIG);
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["(no workspaces)"]);
  });

  test("resolve dispatches to resolve", async () => {
    const io = makeIoFake();
    const container = makeTestGateways({ stdio: io });
    const outcome = await runCli(["resolve", "/outside"], container, CONFIG);
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["no workspace for /outside"]);
  });

  test("reindex with an unknown workspace dispatches to reindex", async () => {
    const container = makeTestGateways({ stdio: makeIoFake() });
    const outcome = await runCli(["reindex", "ghost"], container, CONFIG);
    expect(outcome).toEqual({ exitCode: 1, stderrMessage: "no such workspace: ghost" });
  });

  test("search with no workspace for cwd dispatches to search", async () => {
    const container = makeTestGateways({ stdio: makeIoFake() });
    const outcome = await runCli(["search", "kryptonite"], container, CONFIG);
    expect(outcome).toEqual({
      exitCode: 1,
      stderrMessage: "no workspace for cwd; pass --workspace",
    });
  });

  test("notes with no workspace for cwd dispatches to notes", async () => {
    const container = makeTestGateways({ stdio: makeIoFake() });
    const outcome = await runCli(["notes"], container, CONFIG);
    expect(outcome).toEqual({
      exitCode: 1,
      stderrMessage: "no workspace for cwd; pass --workspace",
    });
  });

  test("commit with an unknown workspace dispatches to commit", async () => {
    const container = makeTestGateways({ stdio: makeIoFake() });
    const outcome = await runCli(["commit", "ghost"], container, CONFIG);
    expect(outcome).toEqual({ exitCode: 1, stderrMessage: "no such workspace: ghost" });
  });

  test("doctor dispatches to doctor", async () => {
    const io = makeIoFake();
    const container = makeTestGateways({ stdio: io });
    const outcome = await runCli(["doctor"], container, CONFIG);
    expect(outcome.exitCode).toBe(0);
    expect(io.written[0]).toContain("registry:");
  });

  // `CliCommand.Hook` is deliberately NOT exercised via `runCli` here, unlike
  // every other case in this file. `dispatch()`'s Hook branch calls
  // `hook(parsed)` with no `Gateways`/`Config` (see `hook.command.ts`'s doc
  // comment), so `hook()` always builds a REAL container/config from the
  // actual process environment — the fake `container` built above is never
  // what it uses. Worse, that real container's `Stdio` is the REAL adapter,
  // whose `exit()` calls the actual `process.exit(0)`: calling `hook()`
  // in-process terminates the entire `bun test` process mid-run, silently,
  // before any results print — exactly the failure mode the `Stdio` port
  // exists to prevent, defeated here because `hook()` cannot accept an
  // injected container at all. Dispatch wiring for `hook` is instead covered
  // where a real `process.exit` is safe: spawned subprocesses in
  // `src/cli/cli.e2e.test.ts` and `src/session/session.failopen.test.ts`.
  // `dispatchHook` — the actual per-name dispatch logic `hook()` delegates
  // to — is fully covered in-process with fakes by
  // `src/session/commands/hookDispatch/hookDispatch.command.test.ts`.

  /**
   * `dispatch`'s `case CliCommand.Install`/`Uninstall` construct
   * `new InstallCommand()`/`new UninstallCommand()` with NO `container`
   * argument, unlike every other case here — so the `container` this test
   * builds via `makeTestGateways` is NEVER what `install`/`uninstall`
   * actually run against; they always build their OWN container from the
   * real `process.env` (`install.command.ts`'s doc comment explains why).
   * Faking that by mutating `process.env.HOME` mid-process does NOT work
   * under Bun — `os.homedir()` resolves `$HOME` once at startup and does not
   * observe a later reassignment in the same process, so doing so would
   * turn this test into a real, unwanted `memory install`/`uninstall` run
   * against this machine's actual `~/.claude/settings.json`,
   * `~/.local/bin/memory`.
   *
   * So each case below is picked because it is safe REGARDLESS of that
   * limitation: `install --dry-run` structurally never writes anything
   * (`InstallService.install` returns before any mutation — see
   * `install.service.ts`), and `uninstall` only ever reads
   * `~/.claude/memory/installed.json` before deciding what to do — so the
   * second test asserts that file does NOT exist first and refuses to run
   * otherwise, rather than silently trusting that assumption forever. Full
   * behavioral coverage of both commands — including every unsafe path (a
   * real write to the user home) — lives in
   * `src/install/commands/install/install.command.test.ts`, entirely against
   * an explicit fake `Gateways` (`procFake`), never the real default.
   */
  test("install --dry-run dispatches to install (always safe: dry-run never writes)", async () => {
    const container = makeTestGateways({ stdio: makeIoFake() });
    const outcome = await runCli(["install", "--dry-run"], container, CONFIG);
    expect(outcome.exitCode).toBe(0);
  });

  /**
   * Constructs `UninstallCommand` directly rather than routing through
   * `runCli`. Going through dispatch would build a real container and reverse
   * this machine's actual install — there is no `--dry-run` equivalent for
   * uninstall to make that safe, unlike the `install` case above.
   */
  test("uninstall exits 0 against a fake container", async () => {
    const container = makeTestGateways({ stdio: makeIoFake() });
    const outcome = await new UninstallCommand(container).execute();
    expect(outcome.exitCode).toBe(0);
  });

  test("--help dispatches to help and exits 0", async () => {
    const io = makeIoFake();
    const container = makeTestGateways({ stdio: io });
    const outcome = await runCli(["--help"], container, CONFIG);
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written.join("")).toContain("memory workspace add");
  });

  test("a bare invocation dispatches to help, as argparse's usage dump did", async () => {
    const io = makeIoFake();
    const container = makeTestGateways({ stdio: io });
    const outcome = await runCli([], container, CONFIG);
    expect(outcome.exitCode).toBe(0);
    expect(io.written.join("")).toContain("Usage:");
  });

  test("--version dispatches to version and exits 0", async () => {
    const io = makeIoFake();
    const container = makeTestGateways({ stdio: io });
    const outcome = await runCli(["--version"], container, CONFIG);
    expect(outcome.exitCode).toBe(0);
    expect(io.written.join("")).toMatch(/^memory \d+\.\d+\.\d+\n$/);
  });

  test("an unknown command exits 2, matching argparse's parse-error code", async () => {
    const container = makeTestGateways({ stdio: makeIoFake() });
    const outcome = await runCli(["frobnicate"], container, CONFIG);
    expect(outcome).toEqual({
      exitCode: 2,
      stderrMessage: "unknown command: frobnicate",
    });
  });
});
