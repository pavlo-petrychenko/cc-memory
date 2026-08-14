import { HookName } from "@/session/index.ts";
import { HookEvent } from "@/session/index.ts";

// A literal `~/`-prefix — matches every other `*_HOME_RELATIVE_PATH` constant
// in this codebase (`registry.service.ts`, `manifest.ts`).
export const SETTINGS_HOME_RELATIVE_PATH = "~/.claude/settings.json";

/** `event -> (hook name for "memory hook <name>", timeout seconds)`:
 * `SessionStart` gets 10s, the other four get 15s. The list's order decides
 * where a brand-new event key lands in `settings.json`'s `hooks` object (see
 * `settings.service.ts`'s `registerOurHooks`). */
export const hookRegistrations: readonly {
  readonly event: HookEvent;
  readonly name: HookName;
  readonly timeoutSeconds: number;
}[] = [
  { event: HookEvent.SessionStart, name: HookName.SessionStart, timeoutSeconds: 10 },
  { event: HookEvent.UserPromptSubmit, name: HookName.MemoryInject, timeoutSeconds: 15 },
  { event: HookEvent.Stop, name: HookName.WrapGate, timeoutSeconds: 15 },
  { event: HookEvent.PostCompact, name: HookName.CompactCheckpoint, timeoutSeconds: 15 },
  { event: HookEvent.SessionEnd, name: HookName.WorklogFloor, timeoutSeconds: 15 },
];

export const HOOK_REGISTRATION_ORDER: readonly {
  readonly event: HookEvent;
  readonly name: string;
}[] = hookRegistrations.map(({ event, name }) => ({ event, name }));

/** A substring test, kept as a one-time fallback for entries an earlier
 * installer left behind before this manifest existed at all. */
export const LEGACY_HOOK_SUBSTRINGS = ["cc-memory", "obsidian-kb-index.py"];
