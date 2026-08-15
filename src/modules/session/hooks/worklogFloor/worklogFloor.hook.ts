import { Hook } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import { RECENT_COMMIT_COUNT } from "@/modules/session/hooks/worklogFloor/worklogFloor.constants.ts";
import type { WorklogFloorPayload } from "@/modules/session/payload/payload.typedefs.ts";
import type {
  HookHandler,
  HookInput,
} from "@/modules/session/runtime/runtime.typedefs.ts";
import { WORKLOG_FLOOR_HOOK } from "@/modules/session/session.constants.ts";
import { HookResultKind } from "@/modules/session/session.typedefs.ts";
import type { HookResult } from "@/modules/session/session.typedefs.ts";
import type {
  WorklogFloorFormatter,
  WorklogStoreService,
} from "@/modules/worklog/index.ts";
import { worktreeSlug } from "@/modules/workspace/index.ts";

function lastLineTrimmed(text: string): string {
  const lines = text.split(/\r\n|\r|\n/);
  const last = lines.at(-1);
  return last === undefined ? "" : last.trim();
}

/** `SessionEnd`: a deterministic, zero-token git/command skeleton appended to
 * today's worklog journal, so even a killed session leaves a record. Write-only —
 * no stdout, ever. */
@Hook(WORKLOG_FLOOR_HOOK)
export class WorklogFloorHook implements HookHandler<WorklogFloorPayload> {
  constructor(
    private readonly container: Gateways,
    private readonly worklogFloorFormatter: WorklogFloorFormatter,
    private readonly worklogStoreService: WorklogStoreService,
  ) {}

  async handle(payload: HookInput<WorklogFloorPayload>): Promise<HookResult> {
    const { workspace, cwd, reason } = payload;
    const slug = worktreeSlug(
      (await this.container.git.showToplevel(cwd)).trim(),
      cwd,
      workspace,
    );
    const date = this.container.clock.today();

    const branch = (
      await this.container.git.revParse(cwd, ["--abbrev-ref", "HEAD"])
    ).trim();
    const diffStat = (await this.container.git.diffStat(cwd, false)).trim();
    const stagedStat = (await this.container.git.diffStat(cwd, true)).trim();
    const recentCommits = (
      await this.container.git.logOneline(cwd, RECENT_COMMIT_COUNT)
    ).trim();

    const combinedStat = diffStat !== "" ? diffStat : stagedStat;
    const uncommitted = combinedStat === "" ? "" : lastLineTrimmed(combinedStat);

    const block = this.worklogFloorFormatter.format({
      date,
      reason,
      branch,
      uncommitted,
      commits: recentCommits,
    });

    try {
      await this.worklogStoreService.appendToDated(workspace, slug, date, block);
    } catch {
      // best-effort write only.
    }
    return { kind: HookResultKind.Silent };
  }
}
