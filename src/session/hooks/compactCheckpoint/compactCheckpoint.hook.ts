import type { Container } from "@/platform/index.ts";
import type { CompactCheckpointFormatter } from "@/session/hooks/compactCheckpoint/compactCheckpoint.formatter.ts";
import type { CompactCheckpointPayload } from "@/session/payload/payload.typedefs.ts";
import type { HookHandler, HookInput } from "@/session/runtime/runtime.typedefs.ts";
import { HookResultKind } from "@/session/session.typedefs.ts";
import type { HookResult } from "@/session/session.typedefs.ts";
import { WorklogStoreService } from "@/worklog/index.ts";
import { worktreeSlug } from "@/workspace/index.ts";

/**
 * `PostCompact`: persist the compaction summary Claude Code hands back after
 * compacting into today's worklog journal, so distilled context survives the
 * reset. Write-only.
 */
export class CompactCheckpointHook implements HookHandler<CompactCheckpointPayload> {
  constructor(
    private readonly container: Container,
    private readonly formatter: CompactCheckpointFormatter,
  ) {}

  async handle(payload: HookInput<CompactCheckpointPayload>): Promise<HookResult> {
    const summary = payload.compactSummary.trim();
    if (summary === "") return { kind: HookResultKind.Silent };

    const { workspace, cwd, trigger } = payload;
    const slug = await worktreeSlug(this.container.git, cwd, workspace);
    const date = this.container.clock.today();
    const block = this.formatter.formatCompactBlock({ trigger, summary });

    try {
      const worklogStoreService = new WorklogStoreService(
        this.container.fs,
        this.container.git,
      );
      await worklogStoreService.appendToDated(workspace, slug, date, block);
    } catch {
      // best-effort write only.
    }
    return { kind: HookResultKind.Silent };
  }
}
