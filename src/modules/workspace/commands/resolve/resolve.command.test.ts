import { describe, expect, test } from "bun:test";

import { CliCommand, type ResolveArgs } from "@/cli/index.ts";
import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import { ResolveCommand } from "@/modules/workspace/commands/resolve/resolve.command.ts";
import { ResolveFormatter } from "@/modules/workspace/commands/resolve/resolve.formatter.ts";
import { makeWorkspaceContext } from "@/modules/workspace/index.ts";
import { makeIoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";
import { makeWorkspaceRepository } from "@/testing/fixtures/workspaceContext.fixture.ts";

// SAFETY: a fixed test fixture, matching the test container fixture's DEFAULT_HOME.
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

function makeResolveCommand(container: Gateways): ResolveCommand {
  const { repository, resolverService } = makeWorkspaceContext(
    container.fs,
    container.git,
  );
  return new ResolveCommand(
    container.env,
    container.stdio,
    repository,
    resolverService,
    new ResolveFormatter(),
  );
}

describe("ResolveCommand.execute", () => {
  test("inside a workspace prints the 5 key: value lines", async () => {
    const io = makeIoFake();
    const container = makeTestGateways({ stdio: io });
    const registryService = makeWorkspaceRepository(container.fs);
    await registryService.save(REGISTRY_PATH, [PRIMARY]);

    const command = makeResolveCommand(container);
    const outcome = await command.execute(resolveArgs({ cwd: "/repo/primary/wt1" }));
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
    const container = makeTestGateways({ stdio: io });
    const registryService = makeWorkspaceRepository(container.fs);
    await registryService.save(REGISTRY_PATH, [PRIMARY]);

    const command = makeResolveCommand(container);
    const outcome = await command.execute(resolveArgs({ cwd: "/outside" }));
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["no workspace for /outside"]);
  });
});
