import type { AbsPath, Config } from "@/core/index.ts";
import { joinAbs, parentDir } from "@/core/index.ts";
import { Hook } from "@/core/index.ts";
import type { Gateways } from "@/gateways/index.ts";
import {
  DEFAULT_SESSION_ID,
  HEAD_LENGTH,
  NO_GIT_HEAD,
  SEVEN_DAYS_MS,
  WRAP_STATE_FILENAME,
} from "@/modules/session/hooks/wrapGate/wrapGate.constants.ts";
import type { WrapGateFormatter } from "@/modules/session/hooks/wrapGate/wrapGate.formatter.ts";
import type {
  WrapStateEntry,
  WrapStateMap,
} from "@/modules/session/hooks/wrapGate/wrapGate.typedefs.ts";
import type { PayloadParser } from "@/modules/session/payload/payload.parser.ts";
import type {
  JsonRecord,
  JsonValue,
} from "@/modules/session/payload/payload.typedefs.ts";
import type { WrapGatePayload } from "@/modules/session/payload/payload.typedefs.ts";
import type {
  HookHandler,
  HookInput,
} from "@/modules/session/runtime/runtime.typedefs.ts";
import { WRAP_GATE_HOOK } from "@/modules/session/session.constants.ts";
import { HookEvent, HookResultKind } from "@/modules/session/session.typedefs.ts";
import type { HookResult } from "@/modules/session/session.typedefs.ts";
import type { WorklogStoreService } from "@/modules/worklog/index.ts";
import { worktreeSlug } from "@/modules/workspace/index.ts";

/** `Stop`: the wrap-gate. Nudges (non-blocking) on the first stop(s) with
 * uncommitted work, escalating to a hard block only after repeated stops with
 * sustained drift. State lives in one `wrap-state.json` per workspace, keyed by
 * session id and pruned of entries older than 7 days on every write. */

function isJsonRecordValue(value: JsonValue | undefined): value is JsonRecord {
  return (
    value !== undefined &&
    value !== null &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

function isJsonNumber(value: JsonValue | undefined): value is number {
  return (
    value !== undefined && Object.prototype.toString.call(value) === "[object Number]"
  );
}

function isJsonString(value: JsonValue | undefined): value is string {
  return (
    value !== undefined && Object.prototype.toString.call(value) === "[object String]"
  );
}

function parseWrapStateEntry(value: JsonValue | undefined): WrapStateEntry | null {
  if (!isJsonRecordValue(value)) return null;
  const sig = value["sig"];
  const ts = value["ts"];
  const nudges = value["nudges"];
  if (!isJsonString(sig) || !isJsonNumber(ts) || !isJsonNumber(nudges)) return null;
  return { sig, ts, nudges };
}

function pruneStaleEntries(map: WrapStateMap, nowMs: number): WrapStateMap {
  return Object.fromEntries(
    Object.entries(map).filter(([, entry]) => nowMs - entry.ts <= SEVEN_DAYS_MS),
  );
}

function withoutSession(map: WrapStateMap, sessionId: string): WrapStateMap {
  return Object.fromEntries(Object.entries(map).filter(([id]) => id !== sessionId));
}

@Hook(WRAP_GATE_HOOK)
export class WrapGateHook implements HookHandler<WrapGatePayload> {
  constructor(
    private readonly container: Gateways,
    private readonly config: Config,
    private readonly payloadParser: PayloadParser,
    private readonly formatter: WrapGateFormatter,
    private readonly worklogStoreService: WorklogStoreService,
  ) {}

  private async readWrapStateMap(path: AbsPath): Promise<WrapStateMap> {
    let text: string;
    try {
      text = await this.container.fs.readFile(path);
    } catch {
      return {};
    }
    const record = this.payloadParser.parseTolerantJson(text);
    const map: Record<string, WrapStateEntry> = {};
    for (const [sessionId, value] of Object.entries(record)) {
      const entry = parseWrapStateEntry(value);
      if (entry !== null) map[sessionId] = entry;
    }
    return map;
  }

  private async writeWrapStateMap(
    path: AbsPath,
    map: WrapStateMap,
    nowMs: number,
  ): Promise<void> {
    await this.container.fs.writeFile(
      path,
      JSON.stringify(pruneStaleEntries(map, nowMs)),
    );
  }

  async handle(payload: HookInput<WrapGatePayload>): Promise<HookResult> {
    if (payload.stopHookActive) return { kind: HookResultKind.Silent }; // never loop

    const { workspace, cwd } = payload;
    const sessionId =
      payload.sessionId !== null && payload.sessionId !== ""
        ? payload.sessionId
        : DEFAULT_SESSION_ID;

    const statusPorcelainRaw = await this.container.git.statusPorcelain(cwd);
    const dirtyCount = statusPorcelainRaw
      .split(/\r\n|\r|\n/)
      .filter((line) => line.trim() !== "").length;

    const markerPath = joinAbs(parentDir(workspace.indexDb), WRAP_STATE_FILENAME);

    if (dirtyCount === 0) {
      try {
        const existingMap = await this.readWrapStateMap(markerPath);
        if (sessionId in existingMap) {
          await this.writeWrapStateMap(
            markerPath,
            withoutSession(existingMap, sessionId),
            this.container.clock.nowMs(),
          );
        }
      } catch {
        // best-effort cleanup only.
      }
      return { kind: HookResultKind.Silent }; // nothing uncommitted to capture
    }

    const headRaw = (await this.container.git.revParse(cwd, ["HEAD"])).trim();
    const head = (headRaw === "" ? NO_GIT_HEAD : headRaw).slice(0, HEAD_LENGTH);
    const sig = `${head}:${dirtyCount}`;

    const slug = worktreeSlug(
      (await this.container.git.showToplevel(cwd)).trim(),
      cwd,
      workspace,
    );
    const state = this.worklogStoreService.statePath(workspace, slug);
    let stateMtimeMs = 0;
    try {
      if (await this.container.fs.exists(state)) {
        stateMtimeMs = (await this.container.fs.stat(state)).mtimeMs;
      }
    } catch {
      stateMtimeMs = 0;
    }

    const stateMap = await this.readWrapStateMap(markerPath);
    const previous = stateMap[sessionId];

    // Already captured: STATE refreshed after our last prompt for this signature.
    if (previous !== undefined && previous.sig === sig && stateMtimeMs > previous.ts) {
      return { kind: HookResultKind.Silent };
    }

    const nudges =
      previous !== undefined && previous.sig === sig ? previous.nudges + 1 : 1;
    const nowMs = this.container.clock.nowMs();
    try {
      await this.writeWrapStateMap(
        markerPath,
        { ...stateMap, [sessionId]: { sig, ts: nowMs, nudges } },
        nowMs,
      );
    } catch {
      // best-effort persistence only.
    }

    const gateInput = { slug, dirtyCount };
    const shouldBlock =
      !this.config.gateDisabled &&
      nudges >= this.config.blockAfter &&
      dirtyCount >= this.config.blockDrift;
    if (shouldBlock) {
      return {
        kind: HookResultKind.Block,
        reason: this.formatter.formatBlockReason(gateInput),
      };
    }
    return {
      kind: HookResultKind.Context,
      event: HookEvent.Stop,
      text: this.formatter.formatNudge(gateInput),
    };
  }
}
