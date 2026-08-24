import { HookDispatchService } from "@/piBridge/hookDispatch/hookDispatch.service.ts";
import {
  defaultMemoryBinPath,
  logToStderr,
  nodeSpawn,
} from "@/piBridge/nodeSpawn/nodeSpawn.adapter.ts";
import {
  CCMEMORY_DISABLED_NOTICE,
  CCMEMORY_ENABLED_NOTICE,
  CCMEMORY_USAGE_NOTICE,
  DEFAULT_SHUTDOWN_REASON,
  INJECTED_MESSAGE_CUSTOM_TYPE,
  SECTION_JOINER,
  SHUTDOWN_REASON_RELOAD,
  TOGGLE_COMMAND_DESCRIPTION,
  TOGGLE_COMMAND_NAME,
} from "@/piBridge/piBridge.constants.ts";
import type {
  HookDispatchPort,
  JsonValue,
  PiAutocompleteItem,
  PiBeforeAgentStartResult,
  PiCommandContext,
  PiEventContext,
  PiExtensionApi,
} from "@/piBridge/piBridge.typedefs.ts";
import { PiHookName, ParsedHookOutputKind } from "@/piBridge/piBridge.typedefs.ts";

function isJsonString(value: JsonValue): value is string {
  return Object.prototype.toString.call(value) === "[object String]";
}

function isJsonRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return value !== null && Object.prototype.toString.call(value) === "[object Object]";
}

/** The bridge needs a cwd to resolve a workspace; without one it stays silent. */
function contextCwd(ctx: PiEventContext): string | null {
  const cwd = ctx.cwd;
  if (cwd === undefined || !isJsonString(cwd) || cwd === "") return null;
  return cwd;
}

function sessionIdOf(ctx: PiEventContext): string {
  try {
    const id = ctx.sessionManager?.getSessionId();
    return id !== undefined && isJsonString(id) ? id : "";
  } catch {
    return "";
  }
}

function compactionSummaryOf(entry: JsonValue): string {
  if (!isJsonRecord(entry)) return "";
  const summary = entry["summary"];
  if (summary === undefined) return "";
  return isJsonString(summary) ? summary : "";
}

function optionalReason(reason: JsonValue): string {
  return isJsonString(reason) ? reason : "";
}

/** What the user asked `/ccmemory` to do, decoded from its raw argument text. */
type ToggleRequest =
  | { readonly kind: "flip" }
  | { readonly kind: "enable" }
  | { readonly kind: "disable" }
  | { readonly kind: "usage" };

function parseToggleRequest(rawArgs: string): ToggleRequest {
  const arg = rawArgs.trim().toLowerCase();
  if (arg === "") return { kind: "flip" };
  if (arg === "on" || arg === "1" || arg === "true") return { kind: "enable" };
  if (arg === "off" || arg === "0" || arg === "false") return { kind: "disable" };
  return { kind: "usage" };
}

function toggleCompletions(prefix: string): readonly PiAutocompleteItem[] | null {
  const values = ["off", "on"].filter((value) => value.startsWith(prefix));
  return values.length === 0 ? null : values.map((value) => ({ value }));
}

/** Feedback is best-effort: a missing or broken UI never blocks the toggle. */
function notify(ctx: PiCommandContext, message: string): void {
  try {
    ctx.ui?.notify?.(message, "info");
  } catch {
    // Swallowed deliberately — see the fail-open rule above.
  }
}

/**
 * The cc-memory bridge inside pi: translates pi lifecycle events into
 * `memory hook <name>` dispatches and their outputs back into pi — injected
 * context ahead of each LLM call, a wrap-gate nudge delivered as a follow-up
 * message, a journal line on compaction, and the STATE floor on shutdown.
 * Every dispatch fails open: a broken install degrades to no memory.
 */
export default function createCcMemoryExtension(
  pi: PiExtensionApi,
  dispatch?: HookDispatchPort,
): void {
  const dispatcher =
    dispatch ?? new HookDispatchService(defaultMemoryBinPath(), nodeSpawn, logToStderr);

  /** True until this session's KB map + working memory have been injected. */
  let pendingSessionStart = true;
  /** Mirrors Claude Code's `stop_hook_active`: the settle that follows a
   * gate-delivered message must not re-check immediately. */
  let gateDeliveryPending = false;
  /** The gate's own follow-up text must not trigger a memory injection. */
  let suppressNextInject = false;
  /** Session-scoped kill switch: false means every dispatch site goes silent
   * until `/ccmemory on` or a fresh session. Nothing persists anywhere. */
  let memoryEnabled = true;

  pi.registerCommand(TOGGLE_COMMAND_NAME, {
    description: TOGGLE_COMMAND_DESCRIPTION,
    getArgumentCompletions: toggleCompletions,
    handler: async (args, ctx) => {
      const request = parseToggleRequest(args);
      if (request.kind === "usage") {
        notify(ctx, CCMEMORY_USAGE_NOTICE);
        return;
      }
      if (request.kind === "flip") memoryEnabled = !memoryEnabled;
      else memoryEnabled = request.kind === "enable";
      // Toggling is a clean reset point: a gate delivery bookkept before an
      // off/on cycle must not swallow the user's next real prompt.
      gateDeliveryPending = false;
      suppressNextInject = false;
      notify(ctx, memoryEnabled ? CCMEMORY_ENABLED_NOTICE : CCMEMORY_DISABLED_NOTICE);
    },
  });

  pi.on("session_start", () => {
    pendingSessionStart = true;
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (!memoryEnabled) return undefined;
    if (suppressNextInject) {
      suppressNextInject = false;
      return undefined;
    }
    const cwd = contextCwd(ctx);
    const sections: string[] = [];

    if (pendingSessionStart && cwd !== null) {
      pendingSessionStart = false;
      const started = await dispatcher.dispatch(PiHookName.SessionStart, { cwd });
      if (started?.kind === ParsedHookOutputKind.Context) sections.push(started.text);
    }

    const rawPrompt = event.prompt;
    const prompt = rawPrompt !== undefined && isJsonString(rawPrompt) ? rawPrompt : "";
    if (cwd !== null && prompt.trim() !== "") {
      const injected = await dispatcher.dispatch(PiHookName.MemoryInject, {
        cwd,
        prompt,
      });
      if (injected?.kind === ParsedHookOutputKind.Context) sections.push(injected.text);
    }

    if (sections.length === 0) return undefined;
    const result: PiBeforeAgentStartResult = {
      message: {
        customType: INJECTED_MESSAGE_CUSTOM_TYPE,
        content: sections.join(SECTION_JOINER),
        display: true,
      },
    };
    return result;
  });

  pi.on("agent_settled", async (_event, ctx) => {
    if (!memoryEnabled) return;
    if (gateDeliveryPending) {
      gateDeliveryPending = false;
      return;
    }
    const cwd = contextCwd(ctx);
    if (cwd === null) return;

    const gate = await dispatcher.dispatch(PiHookName.WrapGate, {
      cwd,
      session_id: sessionIdOf(ctx),
      stop_hook_active: false,
    });
    if (
      gate?.kind !== ParsedHookOutputKind.Block &&
      gate?.kind !== ParsedHookOutputKind.Context
    ) {
      return;
    }

    const reason = gate.kind === ParsedHookOutputKind.Block ? gate.reason : gate.text;
    gateDeliveryPending = true;
    suppressNextInject = true;
    try {
      pi.sendUserMessage(reason, { deliverAs: "followUp" });
    } catch (error) {
      gateDeliveryPending = false;
      suppressNextInject = false;
      logToStderr(
        `wrap-gate delivery failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  pi.on("session_compact", async (event, ctx) => {
    if (!memoryEnabled) return;
    const cwd = contextCwd(ctx);
    if (cwd === null) return;
    const summary = compactionSummaryOf(event.compactionEntry ?? "");
    if (summary.trim() === "") return;
    await dispatcher.dispatch(PiHookName.CompactCheckpoint, {
      cwd,
      compact_summary: summary,
      trigger: optionalReason(event.reason ?? ""),
    });
  });

  pi.on("session_shutdown", async (event, ctx) => {
    if (!memoryEnabled) return;
    const reason = optionalReason(event.reason ?? "");
    if (reason === SHUTDOWN_REASON_RELOAD) return;
    const cwd = contextCwd(ctx);
    if (cwd === null) return;
    await dispatcher.dispatch(PiHookName.WorklogFloor, {
      cwd,
      reason: reason === "" ? DEFAULT_SHUTDOWN_REASON : reason,
    });
  });
}
