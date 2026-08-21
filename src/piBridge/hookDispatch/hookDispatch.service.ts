import { HookOutputParser } from "@/piBridge/hookOutput/hookOutput.parser.ts";
import { HOOK_TIMEOUT_MS } from "@/piBridge/piBridge.constants.ts";
import type {
  HookWirePayload,
  LogPort,
  ParsedHookOutput,
  ProcessSpawnPort,
} from "@/piBridge/piBridge.typedefs.ts";
import { PiHookName } from "@/piBridge/piBridge.typedefs.ts";

/** Runs `memory hook <name>` as a subprocess and decodes its stdout, fail-open:
 * every failure — spawn error, timeout, non-zero exit, unparseable output —
 * logs and returns `null`, so a broken install degrades to no memory instead of
 * a broken session. */
export class HookDispatchService {
  private readonly parser = new HookOutputParser();

  constructor(
    private readonly memoryBinPath: string,
    private readonly spawn: ProcessSpawnPort,
    private readonly logError: LogPort,
  ) {}

  async dispatch(
    hookName: PiHookName,
    payload: HookWirePayload,
  ): Promise<ParsedHookOutput | null> {
    try {
      const outcome = await this.spawn(this.memoryBinPath, ["hook", hookName], {
        input: JSON.stringify(payload),
        timeoutMs: HOOK_TIMEOUT_MS[hookName],
      });
      if (!outcome.ok) {
        this.logError(
          `memory hook '${hookName}' failed: ${outcome.stderr.trim() || "non-zero exit"}`,
        );
        return null;
      }
      return this.parser.parse(outcome.stdout);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logError(`memory hook '${hookName}' could not run: ${message}`);
      return null;
    }
  }
}
