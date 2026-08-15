import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import type { Container } from "@/platform/index.ts";
import type { PayloadParser } from "@/session/payload/payload.parser.ts";
import type { JsonRecord } from "@/session/payload/payload.typedefs.ts";
import type { HookResultSerializer } from "@/session/runtime/hookResult.serializer.ts";
import type { HookHandler } from "@/session/runtime/runtime.typedefs.ts";
import { type HookResult, HookResultKind } from "@/session/session.typedefs.ts";
import { defaultRegistryPath, loadRegistry } from "@/workspace/index.ts";
import { resolveWorkspace } from "@/workspace/index.ts";

/**
 * The shared preamble/postamble every hook needs: read stdin, resolve
 * exactly one workspace for the cwd or go silent (the cwd-to-workspace
 * isolation boundary), run the event's handler, render the result through
 * the hook protocol, write stdout, and — no matter what happens above — exit
 * 0 having LOGGED any failure instead of swallowing it blind.
 *
 * `container` arrives via the constructor rather than being reached for, so
 * this whole pipeline is testable in-process with a fake —
 * `commands/hookDispatch/hookDispatch.command.ts`'s `hook()` is the one
 * place that supplies a REAL container for an actual invocation of `memory
 * hook <name>`.
 */
export class HookRuntimeService {
  constructor(
    private readonly container: Container,
    private readonly payloadParser: PayloadParser,
    private readonly hookResultSerializer: HookResultSerializer,
  ) {}

  /** Falls back to the process cwd when the payload's `cwd` field is either
   * absent or present-but-empty. */
  private resolveHookCwd(rawCwd: string | null): AbsPath {
    if (rawCwd === null || rawCwd === "") return this.container.env.cwd();
    return expandPath(rawCwd, this.container.env.home());
  }

  /**
   * Loads the registry and resolves it against `cwd`. A malformed (present
   * but unparsable) registry is treated as "no workspace" AND logged — this
   * is the hook-specific handling of a `RegistryError`, unlike the CLI,
   * which reports it to the caller.
   */
  private async resolveWorkspaceForHook(cwd: AbsPath): Promise<Workspace | null> {
    const home = this.container.env.home();
    const registryResult = await loadRegistry(
      this.container.fs,
      defaultRegistryPath(home),
    );
    if (!registryResult.ok) {
      this.container.logger.error(
        `hook: registry load failed (${registryResult.error.kind}): ${registryResult.error.message}`,
      );
      return null;
    }
    return resolveWorkspace(registryResult.value, cwd, home);
  }

  /**
   * Run one hook event end to end. `parsePayload` needs `payload.cwd` to
   * resolve a workspace BEFORE it knows whether `handler` should run at all
   * — no workspace means `handler.handle` is never called, matching "no
   * resolved workspace ⇒ silent for EVERY hook".
   *
   * Never throws and never leaves `container.stdio.exit` uncalled: every
   * step from the stdin read onward is inside the `try`, and the `finally`
   * always exits 0, regardless of which branch above it ran.
   */
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
