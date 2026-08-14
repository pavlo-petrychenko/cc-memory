import { describe, expect, test } from "bun:test";

import { CliCommand, type ReflectArgs } from "../../../src/cli/args.ts";
import { reflect } from "../../../src/cli/commands/reflect.command.ts";
import type { AbsPath } from "../../../src/domain/AbsPath.ts";
import { expandPath } from "../../../src/domain/paths.ts";
import type { RawWorkspace } from "../../../src/domain/Workspace.ts";
import { saveRegistry } from "../../../src/services/registry.service.ts";
import { makeTestContainer } from "../../helpers/container.ts";
import { makeIoFake } from "../../helpers/fakes/ioFake.fake.ts";

// SAFETY: a fixed test fixture, matching tests/helpers/container.ts's DEFAULT_HOME.
const HOME = "/home/test" as AbsPath;
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);

const PRIMARY: RawWorkspace = {
  id: "primary",
  match: ["/repo/primary"],
  kb: "/vault-primary",
  worklogs: "/vault-primary/_Worklogs",
  exclude: [],
  indexDb: ":memory:",
};

function reflectArgs(overrides: Partial<ReflectArgs> = {}): ReflectArgs {
  return {
    command: CliCommand.Reflect,
    workspace: null,
    all: false,
    ifDue: false,
    thresholdHours: 20,
    headless: false,
    force: false,
    ...overrides,
  };
}

/**
 * `cmd_reflect` (`bin/memory:195-207`): target resolution is the SAME as
 * `reindex`/`commit` (`resolveTargetWorkspaces`, exercised for real below);
 * the actual reflector run (`services/reflect/run.ts`, P8) is covered
 * exhaustively in `tests/integration/services/reflect/**` — these tests only
 * confirm the command wires targets to it and prints its output, one line
 * per emitted message, for every resolved workspace. `container.fs`'s
 * default empty fake has no `_Worklogs` (or `kb`) content at all, so every
 * successful case below lands on the real, honest "no candidates" message,
 * never a fake/incorrect success.
 */
describe("reflect (cmd_reflect, bin/memory:195-207)", () => {
  test("a known workspace runs the real reflector and prints its result", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });
    await saveRegistry(container.fs, REGISTRY_PATH, [PRIMARY]);

    const outcome = await reflect(container, reflectArgs({ workspace: "primary" }));

    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["primary: no candidates since last run"]);
  });

  test("an unknown workspace still fails EXACTLY like `_targets` (bin/memory:127)", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });
    await saveRegistry(container.fs, REGISTRY_PATH, [PRIMARY]);

    const outcome = await reflect(
      container,
      reflectArgs({ workspace: "ghost", headless: true }),
    );
    expect(outcome).toEqual({ exitCode: 1, stderrMessage: "no such workspace: ghost" });
  });

  test("omitting --workspace runs every registered workspace (the default 'all')", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });
    await saveRegistry(container.fs, REGISTRY_PATH, [PRIMARY]);

    const outcome = await reflect(container, reflectArgs());

    expect(outcome.exitCode).toBe(0);
    expect(io.written).toEqual(["primary: no candidates since last run"]);
  });

  test("`--all` is accepted but consulted nowhere — same as Python's own no-op flag", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });
    await saveRegistry(container.fs, REGISTRY_PATH, [PRIMARY]);

    const outcome = await reflect(
      container,
      reflectArgs({ all: true, workspace: "primary" }),
    );

    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["primary: no candidates since last run"]);
  });
});
