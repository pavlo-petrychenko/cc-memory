import { type HookResult, HookResultKind } from "@/session/session.typedefs.ts";

/**
 * Render a `HookResult` to the hook stdin/stdout JSON protocol. Returns
 * `null` for the silent case: the runtime prints nothing at all rather than
 * an empty line.
 */
export function serializeHookResult(result: HookResult): string | null {
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
