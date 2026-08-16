import { UseCase } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { CC_MEMORY_VERSION } from "@/version.ts";

/** One user-facing operation: print the installed version. */
export class VersionUseCase extends UseCase<
  Record<string, never>,
  Result<readonly string[], string>
> {
  async execute(
    _options: Record<string, never>,
  ): Promise<Result<readonly string[], string>> {
    return { ok: true, value: [`memory ${CC_MEMORY_VERSION}`] };
  }
}
