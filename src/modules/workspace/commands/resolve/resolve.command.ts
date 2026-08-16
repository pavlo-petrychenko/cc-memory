import type { Command as CommandContract } from "@/core/entry/entry.typedefs.ts";
import { Command } from "@/core/index.ts";
import { CLI_SUCCESS, cliFailure } from "@/core/index.ts";
import type { ArgsError, CommandResult, RunContext } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { RESOLVE_DESCRIPTOR } from "@/modules/workspace/commands/resolve/resolve.constants.ts";
import { ResolveFormatter } from "@/modules/workspace/commands/resolve/resolve.formatter.ts";
import { WorkspaceRepository } from "@/modules/workspace/registry/workspace.repository.ts";
import { WorkspaceResolverService } from "@/modules/workspace/resolution/workspace.resolver.service.ts";

export type ResolveOptions = { readonly cwd: string | null };

/** No match here returns success (exit 0) with a message, unlike `search`/`notes`,
 * whose `--workspace`-less cwd miss exits 1. */
@Command(RESOLVE_DESCRIPTOR)
export class ResolveCommand implements CommandContract<ResolveOptions> {
  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly resolverService: WorkspaceResolverService,
    private readonly formatter: ResolveFormatter,
  ) {}

  parse(tokens: readonly string[]): Result<ResolveOptions, ArgsError> {
    const first = tokens[0];
    return {
      ok: true,
      value: { cwd: first !== undefined && !first.startsWith("-") ? first : null },
    };
  }

  async run(options: ResolveOptions, context: RunContext): Promise<CommandResult> {
    const home = context.home;
    const registryResult = await this.repository.load(this.repository.defaultPath(home));
    if (!registryResult.ok) {
      return {
        lines: [],
        ...cliFailure(`registry error: ${registryResult.error.message}`),
      };
    }

    const cwd = options.cwd !== null ? expandPath(options.cwd, home) : context.cwd;
    const workspace = this.resolverService.resolveWorkspace(
      registryResult.value,
      cwd,
      home,
    );
    if (workspace === null) {
      return { lines: [this.formatter.noWorkspaceForCwd(cwd)], ...CLI_SUCCESS };
    }

    const slug = await this.repository.worktreeSlug(cwd, workspace);
    return {
      lines: this.formatter.resolveLines(
        workspace.id,
        slug,
        workspace.kb,
        workspace.worklogs,
        workspace.indexDb,
      ),
      ...CLI_SUCCESS,
    };
  }
}
