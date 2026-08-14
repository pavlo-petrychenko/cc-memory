import type { CommitArgs } from "../cli/args.ts";
import { CLI_SUCCESS, type CliOutcome, cliFailure } from "../cli/CliOutcome.ts";
import { formatCommitResult, formatCommitSkipped } from "../cli/format.ts";
import {
  loadRegistryForCli,
  resolveTargetWorkspaces,
} from "../cli/resolveTarget.service.ts";
import type { AbsPath } from "../core/AbsPath.ts";
import type { Container } from "../platform/container.ts";

/** `bin/memory:188` — `a.message or "memory snapshot"`. */
const DEFAULT_COMMIT_MESSAGE = "memory snapshot";

// Python's `subprocess.run` here carries no explicit timeout; this project's
// other git write calls (`add`/`commit` in `gitCli.adapter.ts`) all use 10s —
// reused here for the same two git subcommands rather than left unbounded.
const GIT_TIMEOUT_MS = 10_000;

async function isGitRepoDir(container: Container, path: AbsPath): Promise<boolean> {
  try {
    return (await container.fs.stat(path)).isDirectory;
  } catch {
    return false;
  }
}

/** One workspace's commit step (`bin/memory:183-190`), run to completion
 * before the next — `git add`/`git commit` in the SAME repo must be
 * sequential, and Python's own loop runs one `subprocess.run` at a time too. */
async function commitOne(
  container: Container,
  workspace: { readonly id: string; readonly kb: AbsPath },
  message: string,
): Promise<string> {
  // SAFETY: `.git` is a fixed literal segment appended to an already-absolute,
  // normalized `AbsPath`.
  const gitDirPath = `${workspace.kb}/.git` as AbsPath;
  if (!(await isGitRepoDir(container, gitDirPath))) {
    return formatCommitSkipped(workspace.id);
  }
  await container.proc.run("git", ["-C", workspace.kb, "add", "-A"], {
    timeoutMs: GIT_TIMEOUT_MS,
  });
  const commitResult = await container.proc.run(
    "git",
    ["-C", workspace.kb, "commit", "-m", message],
    { timeoutMs: GIT_TIMEOUT_MS },
  );
  return formatCommitResult(workspace.id, commitResult.exitCode === 0);
}

/** `cmd_commit` (`bin/memory:181-190`) — manual, local-only snapshot; never
 * pushes, never touches worklogs specifically (unlike
 * `services/worklog.service.ts`'s `commitWorklogs`, this stages the WHOLE kb
 * repo via `git add -A`, so it goes straight through `Proc` rather than the
 * narrower `Git.add`/`Git.commit` port methods). */
export async function commit(
  container: Container,
  args: CommitArgs,
): Promise<CliOutcome> {
  const home = container.env.home();
  const registryResult = await loadRegistryForCli(container.fs, home);
  if (!registryResult.ok) return registryResult.error;

  const targets = resolveTargetWorkspaces(registryResult.value, home, args.workspace);
  if (!targets.ok) return cliFailure(targets.error);

  const message = args.message ?? DEFAULT_COMMIT_MESSAGE;
  for (const workspace of targets.value) {
    // Deliberately sequential (not `Promise.all`): two commits landing in the
    // SAME kb repo at once would race `git add -A`/`git commit`; Python's loop
    // runs one `subprocess.run` at a time for the same reason.
    // eslint-disable-next-line no-await-in-loop
    const line = await commitOne(container, workspace, message);
    container.stdio.write(line);
  }
  return CLI_SUCCESS;
}
