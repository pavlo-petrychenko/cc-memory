import { type HookResult, HookResultKind } from "@/session/session.typedefs.ts";

/** Renders a `HookResult` to the hook stdin/stdout JSON protocol. */
export class HookResultSerializer {
  // Explicit and empty: this serializer has no dependencies of its own, but
  // an explicit constructor keeps its shape consistent with every other
  // constructor-injected class in this module.
  // eslint-disable-next-line no-useless-constructor
  constructor() {}

  /** Returns `null` for the silent case: the runtime prints nothing at all
   * rather than an empty line. */
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
