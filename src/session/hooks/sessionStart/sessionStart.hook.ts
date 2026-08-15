import type { Gateways } from "@/gateways/index.ts";
import type { KbMapFormatter, KbMapService } from "@/knowledge/index.ts";
import type { IndexBuildService } from "@/retrieval/index.ts";
import { CONTEXT_SEPARATOR } from "@/session/hooks/sessionStart/sessionStart.constants.ts";
import type { SessionStartPayload } from "@/session/payload/payload.typedefs.ts";
import type { HookHandler, HookInput } from "@/session/runtime/runtime.typedefs.ts";
import { HookEvent, HookResultKind } from "@/session/session.typedefs.ts";
import type { HookResult } from "@/session/session.typedefs.ts";
import type { WorkingMemoryFormatter, WorklogStoreService } from "@/worklog/index.ts";
import { worktreeSlug } from "@/workspace/index.ts";

/** `SessionStart`: run a fast incremental reindex, then inject the KB map + this
 * worktree's working memory, joined by a horizontal rule. Emits nothing when both
 * parts are empty. */
export class SessionStartHook implements HookHandler<SessionStartPayload> {
  constructor(
    private readonly container: Gateways,
    private readonly indexBuildService: IndexBuildService,
    private readonly kbMapService: KbMapService,
    private readonly kbMapFormatter: KbMapFormatter,
    private readonly worklogStoreService: WorklogStoreService,
    private readonly workingMemoryFormatter: WorkingMemoryFormatter,
  ) {}

  async handle(payload: HookInput<SessionStartPayload>): Promise<HookResult> {
    const { workspace, cwd } = payload;

    try {
      await this.indexBuildService.build(this.container, workspace, {
        incremental: true,
      });
    } catch {
      // reindex failures are swallowed: a stale index beats a broken SessionStart.
    }

    const slug = await worktreeSlug(this.container.git, cwd, workspace);
    const kbMapInput = await this.kbMapService.build(
      workspace,
      this.container.env.home(),
    );
    const kbMapText = kbMapInput === null ? "" : this.kbMapFormatter.format(kbMapInput);

    const state = await this.worklogStoreService.readState(workspace, slug);
    const workingMemoryText = this.workingMemoryFormatter.format({
      workspaceId: workspace.id,
      slug,
      state,
    });

    const parts = [kbMapText, workingMemoryText].filter((part) => part !== "");
    if (parts.length === 0) return { kind: HookResultKind.Silent };

    return {
      kind: HookResultKind.Context,
      event: HookEvent.SessionStart,
      text: parts.join(CONTEXT_SEPARATOR),
    };
  }
}
