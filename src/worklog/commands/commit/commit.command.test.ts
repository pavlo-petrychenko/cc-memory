import { describe, expect, test } from "bun:test";

import { CliCommand, type CommitArgs } from "@/cli/index.ts";
import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeIoFake } from "@/testing/fakes/ioFake.fake.ts";
import { makeProcFake } from "@/testing/fakes/procFake.fake.ts";
import { makeTestContainer } from "@/testing/fixtures/testContainer.fixture.ts";
import { CommitCommand } from "@/worklog/commands/commit/commit.command.ts";
import { CommitFormatter } from "@/worklog/commands/commit/commit.formatter.ts";
import { RegistryService, RegistryTomlSerializer } from "@/workspace/index.ts";

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

function commitArgs(overrides: Partial<CommitArgs> = {}): CommitArgs {
  return { command: CliCommand.Commit, workspace: null, message: null, ...overrides };
}

describe("CommitCommand.execute", () => {
  test("a kb with no .git directory is skipped", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });
    await new RegistryService(container.fs, new RegistryTomlSerializer()).save(
      REGISTRY_PATH,
      [PRIMARY],
    );
    const command = new CommitCommand(
      container.fs,
      container.proc,
      container.env,
      container.stdio,
      container.git,
      new CommitFormatter(),
    );

    const outcome = await command.execute(commitArgs({ workspace: "primary" }));
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["primary: not a git repo, skipping"]);
  });

  test("a successful commit runs `git add -A` then `git commit -m <message>`", async () => {
    const io = makeIoFake();
    const proc = makeProcFake();
    const fs = makeFsMemoryFake();
    const container = makeTestContainer({ stdio: io, proc, fs });
    await new RegistryService(container.fs, new RegistryTomlSerializer()).save(
      REGISTRY_PATH,
      [PRIMARY],
    );
    // SAFETY: a fixed literal directory segment under a hard-coded test fixture path.
    fs.seedDir("/vault-primary/.git" as AbsPath);
    const command = new CommitCommand(
      container.fs,
      container.proc,
      container.env,
      container.stdio,
      container.git,
      new CommitFormatter(),
    );

    const outcome = await command.execute(
      commitArgs({ workspace: "primary", message: "wip" }),
    );
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["primary: committed"]);
    expect(proc.calls).toHaveLength(2);
    expect(proc.calls[0]?.args).toEqual(["-C", "/vault-primary", "add", "-A"]);
    expect(proc.calls[1]?.args).toEqual(["-C", "/vault-primary", "commit", "-m", "wip"]);
  });

  test("defaults the commit message to 'memory snapshot'", async () => {
    const io = makeIoFake();
    const proc = makeProcFake();
    const fs = makeFsMemoryFake();
    const container = makeTestContainer({ stdio: io, proc, fs });
    await new RegistryService(container.fs, new RegistryTomlSerializer()).save(
      REGISTRY_PATH,
      [PRIMARY],
    );
    // SAFETY: a fixed literal directory segment under a hard-coded test fixture path.
    fs.seedDir("/vault-primary/.git" as AbsPath);
    const command = new CommitCommand(
      container.fs,
      container.proc,
      container.env,
      container.stdio,
      container.git,
      new CommitFormatter(),
    );

    await command.execute(commitArgs({ workspace: "primary" }));
    expect(proc.calls[1]?.args).toEqual([
      "-C",
      "/vault-primary",
      "commit",
      "-m",
      "memory snapshot",
    ]);
  });

  test("a non-zero commit exit code prints 'nothing to commit'", async () => {
    const io = makeIoFake();
    const proc = makeProcFake();
    const fs = makeFsMemoryFake();
    const container = makeTestContainer({ stdio: io, proc, fs });
    await new RegistryService(container.fs, new RegistryTomlSerializer()).save(
      REGISTRY_PATH,
      [PRIMARY],
    );
    // SAFETY: a fixed literal directory segment under a hard-coded test fixture path.
    fs.seedDir("/vault-primary/.git" as AbsPath);
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } }); // add
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 1 } }); // commit
    const command = new CommitCommand(
      container.fs,
      container.proc,
      container.env,
      container.stdio,
      container.git,
      new CommitFormatter(),
    );

    const outcome = await command.execute(commitArgs({ workspace: "primary" }));
    expect(outcome.exitCode).toBe(0);
    expect(io.written).toEqual(["primary: nothing to commit"]);
  });

  test("an unknown workspace fails with the exact 'no such workspace' message", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });
    await new RegistryService(container.fs, new RegistryTomlSerializer()).save(
      REGISTRY_PATH,
      [PRIMARY],
    );
    const command = new CommitCommand(
      container.fs,
      container.proc,
      container.env,
      container.stdio,
      container.git,
      new CommitFormatter(),
    );

    const outcome = await command.execute(commitArgs({ workspace: "ghost" }));
    expect(outcome).toEqual({ exitCode: 1, stderrMessage: "no such workspace: ghost" });
  });
});
