import { SessionToggleState, UseCase } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { ToggleFormatter } from "@/modules/sessionToggle/commands/toggle.formatter.ts";
import { isSafeSessionId } from "@/modules/sessionToggle/sessionToggle.utils.ts";
import { ToggleMarkerRepository } from "@/modules/sessionToggle/toggleMarker.repository.ts";

export type ToggleAction = "flip" | "on" | "off" | "status";

export type ToggleMemoryInput = {
  readonly action: ToggleAction;
  readonly explicitSessionId: string | null;
};

/** One user-facing operation: mute/unmute cc-memory for one host session. The
 * session id comes from `--session`, falling back to `$CLAUDE_CODE_SESSION_ID`
 * — the variable Claude Code itself sets on every Bash subprocess. */
export class ToggleMemoryUseCase extends UseCase<
  ToggleMemoryInput,
  Result<readonly string[], string>
> {
  private readonly repository = this.makeRepository(ToggleMarkerRepository);
  private readonly formatter = new ToggleFormatter();

  async execute(input: ToggleMemoryInput): Promise<Result<readonly string[], string>> {
    const sessionId =
      input.explicitSessionId ?? this.gateways.env.get("CLAUDE_CODE_SESSION_ID") ?? null;
    if (sessionId === null || sessionId === "") {
      return { ok: false, error: this.formatter.missingSessionId() };
    }
    if (!isSafeSessionId(sessionId)) {
      return { ok: false, error: this.formatter.unsafeSessionId(sessionId) };
    }

    try {
      if (input.action === "status") {
        const state = await this.repository.stateFor(sessionId);
        return {
          ok: true,
          value: [
            this.formatter.statusLine(sessionId, state === SessionToggleState.Enabled),
          ],
        };
      }

      let enabledAfter: boolean;
      switch (input.action) {
        case "on":
          await this.repository.enable(sessionId);
          enabledAfter = true;
          break;
        case "off":
          await this.repository.disable(sessionId);
          enabledAfter = false;
          break;
        case "flip": {
          const state = await this.repository.stateFor(sessionId);
          if (state === SessionToggleState.Enabled) {
            await this.repository.disable(sessionId);
            enabledAfter = false;
          } else {
            await this.repository.enable(sessionId);
            enabledAfter = true;
          }
          break;
        }
      }
      return {
        ok: true,
        value: [
          enabledAfter
            ? this.formatter.onLine(sessionId)
            : this.formatter.offLine(sessionId),
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  }
}
