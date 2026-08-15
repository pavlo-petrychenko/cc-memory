import type { Command as CommandContract } from "@/core/entry/entry.typedefs.ts";
import { Command } from "@/core/index.ts";
import { CLI_SUCCESS, cliFailure, flagValue } from "@/core/index.ts";
import type { ArgsError, CommandResult, RunContext } from "@/core/index.ts";
import { joinAbs } from "@/core/index.ts";
import type { AbsPath, Result } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import type { FileSystem, Proc } from "@/gateways/index.ts";
import {
  COMMIT_DESCRIPTOR,
  DEFAULT_COMMIT_MESSAGE,
  GIT_TIMEOUT_MS,
} from "@/modules/worklog/commands/commit/commit.constants.ts";
import { CommitFormatter } from "@/modules/worklog/commands/commit/commit.formatter.ts";
import { ResolveTargetWorkspacesUseCase } from "@/modules/workspace/index.ts";

export type CommitOptions = {
  readonly workspace: string | null;
  readonly message: string | null;
};

@Command(COMMIT_DESCRIPTOR)
export class CommitCommand implements CommandContract<CommitOptions> {
  constructor(
    private readonly fs: FileSystem,
    private readonly proc: Proc,
    private readonly resolveTargetWorkspaces: ResolveTargetWorkspacesUseCase,
    private readonly formatter: CommitFormatter,
  ) {}

  parse(tokens: readonly string[]): Result<CommitOptions, ArgsError> {
    const first = tokens[0];
    const hasPositional = first !== undefined && !first.startsWith("-");
    const rest = hasPositional ? tokens.slice(1) : tokens;
    return {
      ok: true,
      value: {
        workspace: hasPositional ? (first ?? null) : null,
        message: flagValue(rest, "-m") ?? flagValue(rest, "--message"),
      },
    };
  }

  async run(options: CommitOptions, context: RunContext): Promise<CommandResult> {
    const resolved = await this.resolveTargetWorkspaces.run(
      context.home,
      options.workspace,
    );
    if (!resolved.ok) return { lines: [], ...cliFailure(resolved.error) };

    const message = options.message ?? DEFAULT_COMMIT_MESSAGE;
    const lines: string[] = [];
    for (const workspace of resolved.value) {
      // Deliberately sequential: two commits in the same kb repo at once would race.
      // eslint-disable-next-line no-await-in-loop
      lines.push(await this.commitOne(workspace, message));
    }
    return { lines, ...CLI_SUCCESS };
  }

  private async commitOne(workspace: Workspace, message: string): Promise<string> {
    const gitDirPath = joinAbs(workspace.kb, ".git");
    if (!(await this.isGitRepoDir(gitDirPath))) {
      return this.formatter.commitSkipped(workspace.id);
    }
    await this.proc.run("git", ["-C", workspace.kb, "add", "-A"], {
      timeoutMs: GIT_TIMEOUT_MS,
    });
    const commitResult = await this.proc.run(
      "git",
      ["-C", workspace.kb, "commit", "-m", message],
      { timeoutMs: GIT_TIMEOUT_MS },
    );
    return this.formatter.commitResult(workspace.id, commitResult.exitCode === 0);
  }

  private async isGitRepoDir(path: AbsPath): Promise<boolean> {
    try {
      return (await this.fs.stat(path)).isDirectory;
    } catch {
      return false;
    }
  }
}
