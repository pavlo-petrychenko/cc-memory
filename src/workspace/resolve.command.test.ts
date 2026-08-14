import { describe, expect, test } from "bun:test";

import { CliCommand, type ResolveArgs } from "../cli/args.ts";
import type { AbsPath } from "../core/AbsPath.ts";
import { expandPath } from "../core/paths.ts";
import type { RawWorkspace } from "../core/Workspace.ts";
import { makeIoFake } from "../testing/fakes/ioFake.fake.ts";
import { makeTestContainer } from "../testing/fixtures/testContainer.fixture.ts";
import { saveRegistry } from "./registry.service.ts";
import { resolve } from "./resolve.command.ts";

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

function resolveArgs(overrides: Partial<ResolveArgs> = {}): ResolveArgs {
  return { command: CliCommand.Resolve, cwd: null, ...overrides };
}

describe("resolve", () => {
  test("inside a workspace prints the 5 key: value lines", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });
    await saveRegistry(container.fs, REGISTRY_PATH, [PRIMARY]);

    const outcome = await resolve(container, resolveArgs({ cwd: "/repo/primary/wt1" }));
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual([
      "workspace: primary",
      "slug:      wt1",
      "kb:        /vault-primary",
      "worklogs:  /vault-primary/_Worklogs",
      "index_db:  :memory:",
    ]);
  });

  test("outside any workspace prints a plain message and still exits 0", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });
    await saveRegistry(container.fs, REGISTRY_PATH, [PRIMARY]);

    const outcome = await resolve(container, resolveArgs({ cwd: "/outside" }));
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["no workspace for /outside"]);
  });
});
