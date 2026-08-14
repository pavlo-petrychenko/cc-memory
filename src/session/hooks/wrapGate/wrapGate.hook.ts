import type { AbsPath, Config } from "@/core/index.ts";
import type { Container } from "@/platform/index.ts";
import {
  DEFAULT_SESSION_ID,
  HEAD_LENGTH,
  NO_GIT_HEAD,
  SEVEN_DAYS_MS,
  WRAP_STATE_FILENAME,
} from "@/session/hooks/wrapGate/wrapGate.constants.ts";
import type { WrapGateFormatter } from "@/session/hooks/wrapGate/wrapGate.formatter.ts";
import type {
  WrapStateEntry,
  WrapStateMap,
} from "@/session/hooks/wrapGate/wrapGate.typedefs.ts";
import type { PayloadParser } from "@/session/payload/payload.parser.ts";
import type { JsonRecord, JsonValue } from "@/session/payload/payload.typedefs.ts";
import type { WrapGatePayload } from "@/session/payload/payload.typedefs.ts";
import type { HookHandler, HookInput } from "@/session/runtime/runtime.typedefs.ts";
import { HookEvent, HookResultKind } from "@/session/session.typedefs.ts";
import type { HookResult } from "@/session/session.typedefs.ts";
import { WorklogStoreService } from "@/worklog/index.ts";
import { worktreeSlug } from "@/workspace/index.ts";

/**
 * `Stop`: the wrap-gate. Nudges (non-blocking) on the first stop(s) with
 * uncommitted work, escalating to a hard block only after repeated stops
 * with sustained drift. State lives in one `wrap-state.json` per workspace,
 * keyed by session id and pruned of entries older than 7 days on every
 * write, rather than one marker file per session — a shared file with
 * pruning can't accumulate unboundedly the way per-session marker files did.
 */

function parentDir(path: AbsPath): AbsPath {
  const lastSlashIndex = path.lastIndexOf("/");
  const sliced = lastSlashIndex <= 0 ? "/" : path.slice(0, lastSlashIndex);
  // SAFETY: slicing an absolute, normalized path at a `/` boundary yields
  // another absolute, normalized path — same reasoning as
  // `services/registry.service.ts`'s `parentDir`.
  return sliced as AbsPath;
}

function joinAbsPath(base: AbsPath, name: string): AbsPath {
  // `base` is exactly the filesystem root ("/") when `parentDir` had nothing
  // to strip (e.g. a test's `indexDb: ":memory:"`) — appending a plain
  // `/${name}` there would double the slash (`"//wrap-state.json"`), a
  // distinct path from `"/wrap-state.json"`.
  const separator = base.endsWith("/") ? "" : "/";
  const joined = `${base}${separator}${name}`;
  // SAFETY: `base` is an already-absolute, normalized `AbsPath`; `name` is
  // the fixed literal `"wrap-state.json"` — never `.`/`..`/`~`.
  return joined as AbsPath;
}

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

/** One marker's shape, validated field by field — a malformed individual
 * entry is dropped rather than invalidating every other session's state in
 * the same shared file. */
function parseWrapStateEntry(value: JsonValue | undefined): WrapStateEntry | null {
  if (!isJsonRecordValue(value)) return null;
  const sig = value["sig"];
  const ts = value["ts"];
  const nudges = value["nudges"];
  if (!isJsonString(sig) || !isJsonNumber(ts) || !isJsonNumber(nudges)) return null;
  return { sig, ts, nudges };
}

/** Prune entries older than 7 days on every write, so the shared state file
 * never grows unboundedly. */
function pruneStaleEntries(map: WrapStateMap, nowMs: number): WrapStateMap {
  return Object.fromEntries(
    Object.entries(map).filter(([, entry]) => nowMs - entry.ts <= SEVEN_DAYS_MS),
  );
}

function withoutSession(map: WrapStateMap, sessionId: string): WrapStateMap {
  return Object.fromEntries(Object.entries(map).filter(([id]) => id !== sessionId));
}

export class WrapGateHook implements HookHandler<WrapGatePayload> {
  constructor(
    private readonly container: Container,
    private readonly config: Config,
    private readonly payloadParser: PayloadParser,
    private readonly formatter: WrapGateFormatter,
    private readonly worklogStoreService: WorklogStoreService = new WorklogStoreService(
      container.fs,
      container.git,
    ),
  ) {}

  /** A missing or unreadable state file reads as `{}`. */
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

    const markerPath = joinAbsPath(parentDir(workspace.indexDb), WRAP_STATE_FILENAME);

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

    const slug = await worktreeSlug(this.container.git, cwd, workspace);
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
