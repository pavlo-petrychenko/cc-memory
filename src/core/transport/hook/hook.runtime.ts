import type { AbsPath } from "@/core/core.typedefs.ts";
import { HookResultKind } from "@/core/transport/hook/hook.typedefs.ts";
import type {
  HookHandler,
  HookResult,
  WorkspaceResolver,
} from "@/core/transport/hook/hook.typedefs.ts";
import type { HookResultSerializer } from "@/core/transport/hook/hookResult.serializer.ts";
import type { PayloadParser } from "@/core/transport/hook/payload.parser.ts";
import type { JsonRecord } from "@/core/transport/hook/payload.typedefs.ts";
import { expandPath } from "@/core/utils/paths/paths.utils.ts";
import type { Gateways } from "@/gateways/gateways.typedefs.ts";

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

  /** No resolved workspace means `handler.handle` is never called. Never throws and
   * never leaves `container.stdio.exit` uncalled: the `finally` always exits 0,
   * regardless of which branch above it ran. */
  async run<TPayload extends { readonly cwd: string | null }>(
    hookLabel: string,
    parsePayload: (record: JsonRecord) => TPayload,
    handler: HookHandler<TPayload>,
  ): Promise<void> {
    try {
      const rawStdin = await this.container.stdio.readStdin();
      const record = this.payloadParser.parseTolerantJson(rawStdin);
      const payload = parsePayload(record);
      const cwd = this.resolveHookCwd(payload.cwd);
      const workspace = await this.resolveWorkspace(cwd);

      const result: HookResult =
        workspace === null
          ? { kind: HookResultKind.Silent }
          : await handler.handle({ ...payload, workspace, cwd });

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
