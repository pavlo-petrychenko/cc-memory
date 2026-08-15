import { type HookResult, HookResultKind } from "@/modules/session/session.typedefs.ts";

/** Renders a `HookResult` to the hook stdin/stdout JSON protocol. */
export class HookResultSerializer {
  serialize(result: HookResult): string | null {
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
}
