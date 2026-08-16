import { UseCase } from "@/core/index.ts";
import type { AbsPath, Workspace } from "@/core/index.ts";
import { joinAbs, parentDir } from "@/core/index.ts";
import { PayloadParser } from "@/core/index.ts";
import { HookEvent, HookResultKind } from "@/core/transport/hook/hook.typedefs.ts";
import type { HookResult } from "@/core/transport/hook/hook.typedefs.ts";
import type { JsonValue } from "@/core/transport/hook/payload.typedefs.ts";
import {
  DEFAULT_SESSION_ID,
  HEAD_LENGTH,
  NO_GIT_HEAD,
  SEVEN_DAYS_MS,
  WRAP_STATE_FILENAME,
} from "@/modules/worklog/hooks/wrapGate/wrapGate.constants.ts";
import { WrapGateFormatter } from "@/modules/worklog/hooks/wrapGate/wrapGate.formatter.ts";
import type {
  WrapStateEntry,
  WrapStateMap,
} from "@/modules/worklog/hooks/wrapGate/wrapGate.typedefs.ts";
import { WorklogStoreService } from "@/modules/worklog/index.ts";
import { worktreeSlug } from "@/modules/workspace/index.ts";

export type WrapGateInput = {
  readonly workspace: Workspace;
  readonly cwd: AbsPath;
  readonly sessionId: string | null;
  readonly stopHookActive: boolean;
};

function isJsonRecordValue(
  value: JsonValue | undefined,
): value is Record<string, JsonValue> {
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

/** `Stop`: the wrap-gate — nudge on uncommitted work, escalating to a hard block. */
export class WrapGateUseCase extends UseCase<WrapGateInput, HookResult> {
  private readonly payloadParser = new PayloadParser();
  private readonly formatter = new WrapGateFormatter();
  private readonly worklogStoreService = this.makeService(WorklogStoreService);

  private async readWrapStateMap(path: AbsPath): Promise<WrapStateMap> {
    let text: string;
    try {
      text = await this.gateways.fs.readFile(path);
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
    await this.gateways.fs.writeFile(path, JSON.stringify(pruneStaleEntries(map, nowMs)));
  }

  async execute(input: WrapGateInput): Promise<HookResult> {
    if (input.stopHookActive) return { kind: HookResultKind.Silent };

    const { workspace, cwd } = input;
    const sessionId =
      input.sessionId !== null && input.sessionId !== ""
        ? input.sessionId
        : DEFAULT_SESSION_ID;

    const statusPorcelainRaw = await this.gateways.git.statusPorcelain(cwd);
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
            this.gateways.clock.nowMs(),
          );
        }
      } catch {
        // best-effort cleanup only.
      }
      return { kind: HookResultKind.Silent };
    }

    const headRaw = (await this.gateways.git.revParse(cwd, ["HEAD"])).trim();
    const head = (headRaw === "" ? NO_GIT_HEAD : headRaw).slice(0, HEAD_LENGTH);
    const sig = `${head}:${dirtyCount}`;

    const slug = worktreeSlug(
      (await this.gateways.git.showToplevel(cwd)).trim(),
      cwd,
      workspace,
    );
    const state = this.worklogStoreService.statePath(workspace, slug);
    let stateMtimeMs = 0;
    try {
      if (await this.gateways.fs.exists(state)) {
        stateMtimeMs = (await this.gateways.fs.stat(state)).mtimeMs;
      }
    } catch {
      stateMtimeMs = 0;
    }

    const stateMap = await this.readWrapStateMap(markerPath);
    const previous = stateMap[sessionId];

    if (previous !== undefined && previous.sig === sig && stateMtimeMs > previous.ts) {
      return { kind: HookResultKind.Silent };
    }

    const nudges =
      previous !== undefined && previous.sig === sig ? previous.nudges + 1 : 1;
    const nowMs = this.gateways.clock.nowMs();
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
