import { describe, expect, test } from "bun:test";

import { CliCommand, type CommitArgs } from "../../../src/cli/args.ts";
import { commit } from "../../../src/cli/commands/commit.command.ts";
import type { AbsPath } from "../../../src/domain/AbsPath.ts";
import { expandPath } from "../../../src/domain/paths.ts";
import type { RawWorkspace } from "../../../src/domain/Workspace.ts";
import { saveRegistry } from "../../../src/services/registry.service.ts";
import { makeTestContainer } from "../../helpers/container.ts";
import { makeFsMemoryFake } from "../../helpers/fakes/fsMemory.fake.ts";
import { makeIoFake } from "../../helpers/fakes/ioFake.fake.ts";
import { makeProcFake } from "../../helpers/fakes/procFake.fake.ts";

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

function commitArgs(overrides: Partial<CommitArgs> = {}): CommitArgs {
  return { command: CliCommand.Commit, workspace: null, message: null, ...overrides };
}

describe("commit (cmd_commit, bin/memory:181-190)", () => {
  test("a kb with no .git directory is skipped", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });
    await saveRegistry(container.fs, REGISTRY_PATH, [PRIMARY]);

    const outcome = await commit(container, commitArgs({ workspace: "primary" }));
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["primary: not a git repo, skipping"]);
  });

  test("a successful commit runs `git add -A` then `git commit -m <message>`", async () => {
    const io = makeIoFake();
    const proc = makeProcFake();
    const fs = makeFsMemoryFake();
    const container = makeTestContainer({ stdio: io, proc, fs });
    await saveRegistry(container.fs, REGISTRY_PATH, [PRIMARY]);
    // SAFETY: a fixed literal directory segment under a hard-coded test fixture path.
    fs.seedDir("/vault-primary/.git" as AbsPath);

    const outcome = await commit(
      container,
      commitArgs({ workspace: "primary", message: "wip" }),
    );
    expect(outcome).toEqual({ exitCode: 0, stderrMessage: null });
    expect(io.written).toEqual(["primary: committed"]);
    expect(proc.calls).toHaveLength(2);
    expect(proc.calls[0]?.args).toEqual(["-C", "/vault-primary", "add", "-A"]);
    expect(proc.calls[1]?.args).toEqual(["-C", "/vault-primary", "commit", "-m", "wip"]);
  });

  test("defaults the commit message to 'memory snapshot' (bin/memory:188)", async () => {
    const io = makeIoFake();
    const proc = makeProcFake();
    const fs = makeFsMemoryFake();
    const container = makeTestContainer({ stdio: io, proc, fs });
    await saveRegistry(container.fs, REGISTRY_PATH, [PRIMARY]);
    // SAFETY: a fixed literal directory segment under a hard-coded test fixture path.
    fs.seedDir("/vault-primary/.git" as AbsPath);

    await commit(container, commitArgs({ workspace: "primary" }));
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
    await saveRegistry(container.fs, REGISTRY_PATH, [PRIMARY]);
    // SAFETY: a fixed literal directory segment under a hard-coded test fixture path.
    fs.seedDir("/vault-primary/.git" as AbsPath);
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } }); // add
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 1 } }); // commit

    const outcome = await commit(container, commitArgs({ workspace: "primary" }));
    expect(outcome.exitCode).toBe(0);
    expect(io.written).toEqual(["primary: nothing to commit"]);
  });

  test("an unknown workspace fails with the exact bin/memory:127 message", async () => {
    const io = makeIoFake();
    const container = makeTestContainer({ stdio: io });
    await saveRegistry(container.fs, REGISTRY_PATH, [PRIMARY]);

    const outcome = await commit(container, commitArgs({ workspace: "ghost" }));
    expect(outcome).toEqual({ exitCode: 1, stderrMessage: "no such workspace: ghost" });
  });
});
