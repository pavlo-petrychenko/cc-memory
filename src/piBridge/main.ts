import { HookDispatchService } from "@/piBridge/hookDispatch/hookDispatch.service.ts";
import {
  defaultMemoryBinPath,
  logToStderr,
  nodeSpawn,
} from "@/piBridge/nodeSpawn/nodeSpawn.adapter.ts";
import {
  DEFAULT_SHUTDOWN_REASON,
  INJECTED_MESSAGE_CUSTOM_TYPE,
  SECTION_JOINER,
  SHUTDOWN_REASON_RELOAD,
} from "@/piBridge/piBridge.constants.ts";
import type {
  HookDispatchPort,
  JsonValue,
  PiBeforeAgentStartResult,
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

  pi.on("session_start", () => {
    pendingSessionStart = true;
  });

  pi.on("before_agent_start", async (event, ctx) => {
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
