import { CLI_SUCCESS } from "@/core/index.ts";
import type { CliOutcome } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { Env, Stdio } from "@/gateways/index.ts";
import { ResolveFormatter } from "@/workspace/commands/resolve/resolve.formatter.ts";
import type { ResolveArgs } from "@/workspace/commands/resolve/resolve.typedefs.ts";
import { WorkspaceResolverService } from "@/workspace/services/resolver/resolver.service.ts";
import { TargetResolutionService } from "@/workspace/targetResolution/targetResolution.service.ts";

/** No match here returns success (exit 0) with a message, unlike `search`/`notes`,
 * whose `--workspace`-less cwd miss exits 1. */
export class ResolveCommand {
  constructor(
    private readonly env: Env,
    private readonly stdio: Stdio,
    private readonly targetResolutionService: TargetResolutionService,
    private readonly resolverService: WorkspaceResolverService,
    private readonly formatter: ResolveFormatter,
  ) {}

  async execute(args: ResolveArgs): Promise<CliOutcome> {
    const home = this.env.home();
    const registryResult = await this.targetResolutionService.loadRegistryForCli(home);
    if (!registryResult.ok) return registryResult.error;

    const cwd = args.cwd !== null ? expandPath(args.cwd, home) : this.env.cwd();
    const workspace = this.resolverService.resolveWorkspace(
      registryResult.value,
      cwd,
      home,
    );
    if (workspace === null) {
      this.stdio.write(this.formatter.noWorkspaceForCwd(cwd));
      return CLI_SUCCESS;
    }

    const slug = await this.resolverService.worktreeSlug(cwd, workspace);
    for (const line of this.formatter.resolveLines(
      workspace.id,
      slug,
      workspace.kb,
      workspace.worklogs,
      workspace.indexDb,
    )) {
      this.stdio.write(line);
    }
    return CLI_SUCCESS;
  }
}
