import { Hook } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import type { CompactCheckpointFormatter } from "@/modules/session/hooks/compactCheckpoint/compactCheckpoint.formatter.ts";
import type { CompactCheckpointPayload } from "@/modules/session/payload/payload.typedefs.ts";
import type {
  HookHandler,
  HookInput,
} from "@/modules/session/runtime/runtime.typedefs.ts";
import { COMPACT_CHECKPOINT_HOOK } from "@/modules/session/session.constants.ts";
import { HookResultKind } from "@/modules/session/session.typedefs.ts";
import type { HookResult } from "@/modules/session/session.typedefs.ts";
import type { WorklogStoreService } from "@/modules/worklog/index.ts";
import { worktreeSlug } from "@/modules/workspace/index.ts";

/** `PostCompact`: persists the compaction summary into today's worklog journal, so
 * distilled context survives the reset. Write-only. */
@Hook(COMPACT_CHECKPOINT_HOOK)
export class CompactCheckpointHook implements HookHandler<CompactCheckpointPayload> {
  constructor(
    private readonly container: Gateways,
    private readonly formatter: CompactCheckpointFormatter,
    private readonly worklogStoreService: WorklogStoreService,
  ) {}

  async handle(payload: HookInput<CompactCheckpointPayload>): Promise<HookResult> {
    const summary = payload.compactSummary.trim();
    if (summary === "") return { kind: HookResultKind.Silent };

    const { workspace, cwd, trigger } = payload;
    const slug = worktreeSlug(
      (await this.container.git.showToplevel(cwd)).trim(),
      cwd,
      workspace,
    );
    const date = this.container.clock.today();
    const block = this.formatter.formatCompactBlock({ trigger, summary });

    try {
      await this.worklogStoreService.appendToDated(workspace, slug, date, block);
    } catch {
      // best-effort write only.
    }
    return { kind: HookResultKind.Silent };
  }
}
