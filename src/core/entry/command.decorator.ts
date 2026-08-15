import type { CommandClass, CommandDescriptor } from "@/core/entry/entry.typedefs.ts";

/** Attaches a `CommandDescriptor` to a command class as its static `spec` — the
 * only effect. Registration stays an explicit list in `cli.wiring.ts`; nothing runs
 * at import time. */
export function Command(spec: CommandDescriptor) {
  return function <T extends CommandClass>(
    target: T,
    _context: ClassDecoratorContext<T>,
  ): T {
    Object.defineProperty(target, "spec", { value: spec });
    return target;
  };
}
