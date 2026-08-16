import type { AbsPath } from "@/core/core.typedefs.ts";
import type { HookHandler } from "@/core/decorators/hook.decorator.ts";
import type { Workspace } from "@/core/domain.typedefs.ts";
import { HookResultKind } from "@/core/transport/hook/hook.typedefs.ts";
import type {
  HookResult,
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
  ) {}

  private resolveHookCwd(rawCwd: string | null): AbsPath {
    if (rawCwd === null || rawCwd === "") return this.container.env.cwd();
    return expandPath(rawCwd, this.container.env.home());
  }

  /** No resolved workspace means `handler` is never called. Never throws and never
   * leaves `container.stdio.exit` uncalled: the `finally` always exits 0. */
  async run(hookLabel: string, handler: HookHandle): Promise<void> {
    try {
      const rawStdin = await this.container.stdio.readStdin();
      const record = this.payloadParser.parseTolerantJson(rawStdin);
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
  );
  await runtime.run(name, handler.handle);
}
