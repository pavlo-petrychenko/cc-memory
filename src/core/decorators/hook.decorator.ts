import type { UseCaseConstructor } from "@/core/base/constructor.typedefs.ts";
import type { AppContext } from "@/core/base/context.typedefs.ts";
import type { AbsPath, JsonRecord, Workspace } from "@/core/index.ts";
import type {
  HookEvent,
  HookName,
  HookResult,
} from "@/core/transport/hook/hook.typedefs.ts";

export const HOOK_METADATA = Symbol("hook");

export interface HookParams<Options> {
  readonly name: HookName;
  readonly event: HookEvent;
  readonly timeoutSeconds: number;
  readonly Handler: UseCaseConstructor<Options, HookResult>;
  readonly mapOptions: (
    payload: JsonRecord,
    workspace: Workspace,
    cwd: AbsPath,
    ctx: AppContext,
  ) => Options;
}

export type HookClass = abstract new (...args: never[]) => object;

/** Attaches `params` to a hook class under `HOOK_METADATA` — the only effect.
 * The descriptor's `event` and `timeoutSeconds` are what the installer writes
 * into `settings.json`. */
export function Hook<Options>(params: HookParams<Options>) {
  return function <T extends HookClass>(
    target: T,
    _context: ClassDecoratorContext<T>,
  ): T {
    Object.defineProperty(target, HOOK_METADATA, { value: params });
    return target;
  };
}

export interface HookHandler {
  readonly name: HookName;
  readonly handle: (
    payload: JsonRecord,
    workspace: Workspace,
    cwd: AbsPath,
  ) => Promise<HookResult>;
}

type DecoratedHook = {
  readonly [HOOK_METADATA]?: HookParams<unknown>;
};

export function registerHooks(
  hookClasses: readonly HookClass[],
  ctx: AppContext,
): HookHandler[] {
  return hookClasses.map((HookClass) => {
    // SAFETY: `@Hook` writes `HOOK_METADATA` onto the class at decoration time;
    // the assertion only reads back the property it is known to have set.
    const params = (HookClass as DecoratedHook)[HOOK_METADATA];
    if (params === undefined) {
      throw new Error(`${HookClass.name} has no @Hook decorator`);
    }
    const useCase = new params.Handler(ctx);
    return {
      name: params.name,
      handle: async (payload, workspace, cwd) => {
        const options = params.mapOptions(payload, workspace, cwd, ctx);
        return useCase.execute(options);
      },
    };
  });
}
