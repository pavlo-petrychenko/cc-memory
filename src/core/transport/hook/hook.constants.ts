import type { HookDescriptor } from "@/core/entry/entry.typedefs.ts";
import { HookEvent, HookName } from "@/core/transport/hook/hook.typedefs.ts";

export const SESSION_START_HOOK: HookDescriptor = {
  name: HookName.SessionStart,
  event: HookEvent.SessionStart,
  timeoutSeconds: 10,
};

export const MEMORY_INJECT_HOOK: HookDescriptor = {
  name: HookName.MemoryInject,
  event: HookEvent.UserPromptSubmit,
  timeoutSeconds: 15,
};

export const WRAP_GATE_HOOK: HookDescriptor = {
  name: HookName.WrapGate,
  event: HookEvent.Stop,
  timeoutSeconds: 15,
};

export const COMPACT_CHECKPOINT_HOOK: HookDescriptor = {
  name: HookName.CompactCheckpoint,
  event: HookEvent.PostCompact,
  timeoutSeconds: 15,
};

export const WORKLOG_FLOOR_HOOK: HookDescriptor = {
  name: HookName.WorklogFloor,
  event: HookEvent.SessionEnd,
  timeoutSeconds: 15,
};

/** The single registration record for every hook — its order decides where a
 * brand-new event lands in `settings.json`'s `hooks` object. The installer
 * writes each entry's `event`/`timeoutSeconds` verbatim. */
export const HOOK_DESCRIPTORS: readonly HookDescriptor[] = [
  SESSION_START_HOOK,
  MEMORY_INJECT_HOOK,
  WRAP_GATE_HOOK,
  COMPACT_CHECKPOINT_HOOK,
  WORKLOG_FLOOR_HOOK,
];
