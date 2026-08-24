import type { AbsPath } from "@/core/core.typedefs.ts";
import type { HookHandler } from "@/core/decorators/hook.decorator.ts";
import type { Workspace } from "@/core/domain.typedefs.ts";
import {
  HookName,
  HookResultKind,
  SessionToggleState,
} from "@/core/transport/hook/hook.typedefs.ts";
import type {
  HookResult,
  SessionTogglePort,
  WorkspaceResolver,
} from "@/core/transport/hook/hook.typedefs.ts";
import { HookResultSerializer } from "@/core/transport/hook/hookResult.serializer.ts";
import { PayloadParser } from "@/core/transport/hook/payload.parser.ts";
import type { JsonRecord } from "@/core/transport/hook/payload.typedefs.ts";
import { expandPath } from "@/core/utils/paths/paths.utils.ts";
import type { Gateways } from "@/gateways/gateways.typedefs.ts";

export type HookHandle = (
  record: JsonRecord,
  workspace: Workspace,
  cwd: AbsPath,
) => Promise<HookResult>;

/** The shared preamble/postamble every hook needs: read stdin, resolve exactly one
 * workspace for the cwd via the injected port (or go silent), run the handler, and
 * — no matter what happens — exit 0, having LOGGED any failure instead of
 * swallowing it blind. */
export class HookRuntimeService {
  constructor(
    private readonly container: Gateways,
    private readonly payloadParser: PayloadParser,
    private readonly hookResultSerializer: HookResultSerializer,
    private readonly resolveWorkspace: WorkspaceResolver,
    private readonly sessionToggle: SessionTogglePort,
  ) {}

  private resolveHookCwd(rawCwd: string | null): AbsPath {
    if (rawCwd === null || rawCwd === "") return this.container.env.cwd();
    return expandPath(rawCwd, this.container.env.home());
  }

  /** The session-scoped `/ccmemory` toggle: a marker for THIS session id means
   * every dispatch goes silent. The worklog floor clears its session's marker
   * first — cleanup must happen even while disabled. Any read failure fails
   * open to enabled, logged, per the hooks-fail-open invariant. */
  private async silencedBySessionToggle(
    hookLabel: string,
    record: JsonRecord,
  ): Promise<boolean> {
    const sessionId = this.payloadParser.parseSessionId(record);
    if (sessionId === null) return false;
    try {
      const state = await this.sessionToggle.stateFor(sessionId);
      if (state !== SessionToggleState.Disabled) return false;
      if (hookLabel === HookName.WorklogFloor) {
        await this.sessionToggle.enable(sessionId);
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.container.logger.error(
        `hook '${hookLabel}': toggle check failed for session '${sessionId}': ${message}`,
      );
      return false;
    }
  }

  /** No resolved workspace means `handler` is never called. Never throws and never
   * leaves `container.stdio.exit` uncalled: the `finally` always exits 0. */
  async run(hookLabel: string, handler: HookHandle): Promise<void> {
    try {
      const rawStdin = await this.container.stdio.readStdin();
      const record = this.payloadParser.parseTolerantJson(rawStdin);
      if (await this.silencedBySessionToggle(hookLabel, record)) return;
      const cwd = this.resolveHookCwd(this.payloadParser.parseSessionStart(record).cwd);
      const workspace = await this.resolveWorkspace(cwd);

      const result: HookResult =
        workspace === null
          ? { kind: HookResultKind.Silent }
          : await handler(record, workspace, cwd);

      const rendered = this.hookResultSerializer.serialize(result);
      if (rendered !== null) this.container.stdio.write(rendered);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.container.logger.error(`hook '${hookLabel}' failed: ${message}`);
    } finally {
      this.container.stdio.exit(0);
    }
  }
}

/** Dispatches `memory hook <name>` through the registered handlers, fail-open:
 * an unknown name logs and exits 0, never a non-zero exit. */
export async function runHookDispatch(
  name: string,
  handlers: readonly HookHandler[],
  container: Gateways,
  resolveWorkspace: WorkspaceResolver,
  sessionToggle: SessionTogglePort,
): Promise<void> {
  const handler = handlers.find((candidate) => candidate.name === name);
  if (handler === undefined) {
    container.logger.error(`hook '${name}': unknown hook name`);
    container.stdio.writeStderr(`memory hook '${name}': unknown hook name`);
    container.stdio.exit(0);
    return;
  }
  const runtime = new HookRuntimeService(
    container,
    new PayloadParser(),
    new HookResultSerializer(),
    resolveWorkspace,
    sessionToggle,
  );
  await runtime.run(name, handler.handle);
}
