import { PiHookName } from "@/piBridge/piBridge.typedefs.ts";

/** `~/.local/bin/memory` — the installed shim with absolute paths baked in, so
 * the bridge never has to know where the repo or bun live. */
export const MEMORY_BIN_HOME_RELATIVE_PATH = "~/.local/bin/memory";

/** customType for the context messages the bridge injects into the session. */
export const INJECTED_MESSAGE_CUSTOM_TYPE = "cc-memory";

/** Joins the session-start and per-prompt sections into one injected message. */
export const SECTION_JOINER = "\n\n---\n\n";

/** Per-hook spawn timeouts, mirroring the timeouts Claude Code registers. */
export const HOOK_TIMEOUT_MS = {
  [PiHookName.SessionStart]: 10_000,
  [PiHookName.MemoryInject]: 15_000,
  [PiHookName.WrapGate]: 15_000,
  [PiHookName.CompactCheckpoint]: 15_000,
  [PiHookName.WorklogFloor]: 15_000,
} as const satisfies Readonly<Record<PiHookName, number>>;

/** A reload tears the runtime down and rebuilds it in place — not a session
 * ending, so no worklog floor is written for one. */
export const SHUTDOWN_REASON_RELOAD = "reload";

/** Reason reported to the worklog floor when pi does not name one. */
export const DEFAULT_SHUTDOWN_REASON = "quit";

/** The slash command the bridge registers in pi for the session-scoped toggle. */
export const TOGGLE_COMMAND_NAME = "ccmemory";

export const TOGGLE_COMMAND_DESCRIPTION =
  "Toggle cc-memory (injections, wrap-gate, journaling) for this pi session";

/** Feedback lines the toggle command reports back through `ui.notify`. */
export const CCMEMORY_ENABLED_NOTICE =
  "cc-memory ON — context injection, wrap-gate and journaling active.";
export const CCMEMORY_DISABLED_NOTICE =
  "cc-memory OFF — silent until /ccmemory on or a new session.";
export const CCMEMORY_USAGE_NOTICE = "usage: /ccmemory [on|off] — no argument toggles.";
