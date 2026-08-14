import { type HookResult, HookResultKind } from "./HookResult.ts";

/**
 * Render a `HookResult` to the C2 stdin/stdout JSON protocol — the
 * `print(json.dumps(...))` calls duplicated across all 5 `*.py` hooks
 * (`hooks/session-start.py:130-131`, `hooks/memory-inject.py:93-95`,
 * `hooks/wrap-gate.py:37-43`). Returns `null` for the silent case: the runtime
 * (`hooks/runtime.ts`, P7) prints nothing at all rather than an empty line.
 */
export function renderHookResult(result: HookResult): string | null {
  switch (result.kind) {
    case HookResultKind.Silent:
      return null;
    case HookResultKind.Context:
      return JSON.stringify({
        hookSpecificOutput: {
          hookEventName: result.event,
          additionalContext: result.text,
        },
      });
    case HookResultKind.Block:
      return JSON.stringify({ decision: "block", reason: result.reason });
  }
}
