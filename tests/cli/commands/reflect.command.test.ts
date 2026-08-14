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

describe("reflect stub (bin/memory:195-207 — P8 owns the real reflector)", () => {
  test("a known workspace reports plainly that it isn't implemented, never a fake success", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });
    await saveRegistry(container.fs, REGISTRY_PATH, [PRIMARY]);

    const outcome = await reflect(container, reflectArgs({ workspace: "primary" }));
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["primary: reflect not implemented yet (P8)"]);
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

  test("omitting --workspace reports every registered workspace (the default 'all')", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });
    await saveRegistry(container.fs, REGISTRY_PATH, [PRIMARY]);

    const outcome = await reflect(container, reflectArgs());
    expect(outcome.exitCode).toBe(0);
    expect(io.written).toEqual(["primary: reflect not implemented yet (P8)"]);
  });
});
