import { Repository, expandPath } from "@/core/index.ts";
import type { AbsPath } from "@/core/index.ts";
import { joinAbs } from "@/core/index.ts";
import { SessionToggleState } from "@/core/index.ts";
import type { SessionTogglePort } from "@/core/index.ts";
import {
  MARKER_MAX_AGE_MS,
  TOGGLES_DIR_HOME_RELATIVE_PATH,
} from "@/modules/sessionToggle/sessionToggle.constants.ts";
import {
  isSafeSessionId,
  markerFileName,
} from "@/modules/sessionToggle/sessionToggle.utils.ts";

/** The marker-file store behind the session toggle: `<session-id>.off` files
 * under `~/.claude/memory/toggles/`. Reads fail open to Enabled at the runtime
 * (which catches and logs); unsafe ids never touch the filesystem. Every
 * operation also sweeps markers older than `MARKER_MAX_AGE_MS`, so sessions
 * that died without their SessionEnd cleanup cannot accumulate forever. */
export class ToggleMarkerRepository extends Repository implements SessionTogglePort {
  private readonly fs = this.gateways.fs;

  async stateFor(sessionId: string): Promise<SessionToggleState> {
    if (!isSafeSessionId(sessionId)) return SessionToggleState.Enabled;
    await this.sweepExpired();
    const silenced = await this.fs.exists(this.markerPath(sessionId));
    return silenced ? SessionToggleState.Disabled : SessionToggleState.Enabled;
  }

  async disable(sessionId: string): Promise<void> {
    if (!isSafeSessionId(sessionId)) throw new Error(`unsafe session id '${sessionId}'`);
    await this.fs.mkdir(this.togglesDir());
    await this.fs.writeFile(this.markerPath(sessionId), "");
    await this.sweepExpired();
  }

  async enable(sessionId: string): Promise<void> {
    if (!isSafeSessionId(sessionId)) throw new Error(`unsafe session id '${sessionId}'`);
    await this.fs.remove(this.markerPath(sessionId));
    await this.sweepExpired();
  }

  private togglesDir(): AbsPath {
    return expandPath(TOGGLES_DIR_HOME_RELATIVE_PATH, this.gateways.env.home());
  }

  private markerPath(sessionId: string): AbsPath {
    return joinAbs(this.togglesDir(), markerFileName(sessionId));
  }

  /** Best-effort: a sweep failure must never make a toggle operation fail. */
  private async sweepExpired(): Promise<void> {
    try {
      const dir = this.togglesDir();
      if (!(await this.fs.exists(dir))) return;
      const cutoff = this.gateways.clock.nowMs() - MARKER_MAX_AGE_MS;
      const names = await this.fs.readDir(dir);
      await Promise.all(
        names.map(async (name) => {
          const path = joinAbs(dir, name);
          const stat = await this.fs.stat(path);
          if (stat.mtimeMs < cutoff) await this.fs.remove(path);
        }),
      );
    } catch {
      // Sweep is housekeeping only — ignore.
    }
  }
}
