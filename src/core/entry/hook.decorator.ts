import type { HookDescriptor } from "@/core/entry/entry.typedefs.ts";

/** The constructor shape `@Hook` accepts: any class. */
export type HookClass = abstract new (...args: never[]) => object;

/** Attaches a `HookDescriptor` to a hook class as its static `spec` — the only
 * effect. The descriptor's `event` and `timeoutSeconds` are what the installer
 * writes into `settings.json`. */
export function Hook(descriptor: HookDescriptor) {
  return function <T extends HookClass>(
    target: T,
    _context: ClassDecoratorContext<T>,
  ): T {
    Object.defineProperty(target, "spec", { value: descriptor });
    return target;
  };
}
