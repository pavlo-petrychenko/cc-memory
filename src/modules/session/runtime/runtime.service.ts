import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import type { PayloadParser } from "@/modules/session/payload/payload.parser.ts";
import type { JsonRecord } from "@/modules/session/payload/payload.typedefs.ts";
import type { HookResultSerializer } from "@/modules/session/runtime/hookResult.serializer.ts";
import type { HookHandler } from "@/modules/session/runtime/runtime.typedefs.ts";
import { type HookResult, HookResultKind } from "@/modules/session/session.typedefs.ts";
import { makeWorkspaceContext } from "@/modules/workspace/index.ts";

/** The shared preamble/postamble every hook needs: resolve exactly one workspace
 * for the cwd or go silent, run the handler, and — no matter what happens — exit 0,
 * having LOGGED any failure instead of swallowing it blind. */
export class HookRuntimeService {
  constructor(
    private readonly container: Gateways,
    private readonly payloadParser: PayloadParser,
    private readonly hookResultSerializer: HookResultSerializer,
  ) {}

  private resolveHookCwd(rawCwd: string | null): AbsPath {
    if (rawCwd === null || rawCwd === "") return this.container.env.cwd();
    return expandPath(rawCwd, this.container.env.home());
  }

  /** A malformed registry is treated as "no workspace" AND logged — unlike the
   * CLI, which reports a `RegistryError` to the caller instead. */
  private async resolveWorkspaceForHook(cwd: AbsPath): Promise<Workspace | null> {
    const home = this.container.env.home();
    const { repository, resolverService } = makeWorkspaceContext(
      this.container.fs,
      this.container.git,
    );
    const registryResult = await repository.load(repository.defaultPath(home));
    if (!registryResult.ok) {
      this.container.logger.error(
        `hook: registry load failed (${registryResult.error.kind}): ${registryResult.error.message}`,
      );
      return null;
    }
    return resolverService.resolveWorkspace(registryResult.value, cwd, home);
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
      const workspace = await this.resolveWorkspaceForHook(cwd);

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
