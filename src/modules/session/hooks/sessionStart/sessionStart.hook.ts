import { Hook } from "@/core/index.ts";
import { SESSION_START_HOOK } from "@/core/transport/hook/hook.constants.ts";
import type { HookHandler, HookInput } from "@/core/transport/hook/hook.typedefs.ts";
import { HookEvent, HookResultKind } from "@/core/transport/hook/hook.typedefs.ts";
import type { HookResult } from "@/core/transport/hook/hook.typedefs.ts";
import type { SessionStartPayload } from "@/core/transport/hook/payload.typedefs.ts";
import type { Gateways } from "@/gateways/index.ts";
import type { KbMapFormatter } from "@/modules/note/index.ts";
import { BuildKbMapUseCase, ReprojectNotesUseCase } from "@/modules/note/index.ts";
import { CONTEXT_SEPARATOR } from "@/modules/session/hooks/sessionStart/sessionStart.constants.ts";
import type {
  WorkingMemoryFormatter,
  WorklogStoreService,
} from "@/modules/worklog/index.ts";
import { ReprojectWorklogUseCase } from "@/modules/worklog/index.ts";
import { worktreeSlug } from "@/modules/workspace/index.ts";

/** `SessionStart`: run a fast incremental reindex, then inject the KB map + this
 * worktree's working memory, joined by a horizontal rule. Emits nothing when both
 * parts are empty. */
@Hook(SESSION_START_HOOK)
export class SessionStartHook implements HookHandler<SessionStartPayload> {
  constructor(
    private readonly container: Gateways,
    private readonly reprojectNotes: ReprojectNotesUseCase,
    private readonly reprojectWorklog: ReprojectWorklogUseCase,
    private readonly buildKbMap: BuildKbMapUseCase,
    private readonly kbMapFormatter: KbMapFormatter,
    private readonly worklogStoreService: WorklogStoreService,
    private readonly workingMemoryFormatter: WorkingMemoryFormatter,
  ) {}

  async handle(payload: HookInput<SessionStartPayload>): Promise<HookResult> {
    const { workspace, cwd } = payload;

    try {
      await this.reprojectNotes.run(workspace, { incremental: true });
      await this.reprojectWorklog.run(workspace);
    } catch {
      // reindex failures are swallowed: a stale index beats a broken SessionStart.
    }

    const slug = worktreeSlug(
      (await this.container.git.showToplevel(cwd)).trim(),
      cwd,
      workspace,
    );
    const kbMapInput = await this.buildKbMap.run(workspace, this.container.env.home());
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
