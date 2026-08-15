import { ReindexFormatter } from "@/cli/reindex.formatter.ts";
import type { ReindexArgs } from "@/cli/reindex.typedefs.ts";
import { CLI_SUCCESS, cliFailure } from "@/core/index.ts";
import type { CliOutcome } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import { ReprojectNotesUseCase } from "@/modules/note/index.ts";
import { ReprojectWorklogUseCase } from "@/modules/worklog/index.ts";
import { makeWorkspaceContext } from "@/modules/workspace/index.ts";

export class ReindexCommand {
  constructor(
    private readonly reprojectNotes: ReprojectNotesUseCase,
    private readonly reprojectWorklog: ReprojectWorklogUseCase,
    private readonly formatter: ReindexFormatter,
  ) {}

  /** One line per target workspace, printed in registry order (`Promise.all`
   * preserves that order in its result array even though the builds run
   * concurrently). */
  async execute(container: Gateways, args: ReindexArgs): Promise<CliOutcome> {
    const home = container.env.home();
    const { repository, targetResolutionService } = makeWorkspaceContext(
      container.fs,
      container.git,
    );
    const registryResult = await repository.load(repository.defaultPath(home));
    if (!registryResult.ok) {
      return cliFailure(`registry error: ${registryResult.error.message}`);
    }

    const targets = targetResolutionService.resolveTargetWorkspaces(
      registryResult.value,
      home,
      args.workspace,
    );
    if (!targets.ok) return cliFailure(targets.error);

    const lines = await Promise.all(
      targets.value.map(async (workspace) => {
        const stats = await this.reprojectNotes.run(workspace, {
          incremental: !args.full,
        });
        await this.reprojectWorklog.run(workspace);
        return this.formatter.line(
          workspace.id,
          stats.added,
          stats.updated,
          stats.removed,
          stats.total,
        );
      }),
    );
    for (const line of lines) container.stdio.write(line);
    return CLI_SUCCESS;
  }
}
