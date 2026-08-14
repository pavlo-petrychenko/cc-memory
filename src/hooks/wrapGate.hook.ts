import type { AbsPath } from "../domain/AbsPath.ts";
import { HookEvent, HookResultKind } from "../domain/HookResult.ts";
import { renderBlockReason, renderNudge } from "../domain/render/wrapGate.renderer.ts";
import type { FileSystem } from "../ports/fileSystem.port.ts";
import { worktreeSlug } from "../services/resolver.service.ts";
import { statePath } from "../services/worklog.service.ts";
import type { JsonRecord, JsonValue, WrapGatePayload } from "./payload.ts";
import { parseTolerantJson } from "./payload.ts";
import type { HookHandler } from "./runtime.ts";

/**
 * `Stop` (`hooks/wrap-gate.py:46-108`): the wrap-gate. Nudges (non-blocking)
 * on the first stop(s) with uncommitted work, escalating to a hard block only
 * after repeated stops with sustained drift. State that used to be 142 leaked
 * `.wrap-<session_id>` marker FILES ([[bugfixes]] #1) is now one
 * `wrap-state.json` per workspace, keyed by session id and pruned of entries
 * older than 7 days on every write.
 */

const DEFAULT_SESSION_ID = "nosession"; // `payload.get("session_id") or "nosession"`, wrap-gate.py:55
const HEAD_LENGTH = 12; // wrap-gate.py:62
const NO_GIT_HEAD = "nogit";
const WRAP_STATE_FILENAME = "wrap-state.json"; // [[bugfixes]] #1
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // [[bugfixes]] #1 — new pruning window

type WrapStateEntry = {
  readonly sig: string;
  readonly ts: number;
  readonly nudges: number;
};
type WrapStateMap = Readonly<Record<string, WrapStateEntry>>;

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

/** `prev = json.load(fh)` / `except Exception: prev = {}`
 * (`wrap-gate.py:78-83`) generalized to a shared, multi-session file: a
 * missing or unreadable file reads as `{}`, same as before. */
async function readWrapStateMap(fs: FileSystem, path: AbsPath): Promise<WrapStateMap> {
  let text: string;
  try {
    text = await fs.readFile(path);
  } catch {
    return {};
  }
  const record = parseTolerantJson(text);
  const map: Record<string, WrapStateEntry> = {};
  for (const [sessionId, value] of Object.entries(record)) {
    const entry = parseWrapStateEntry(value);
    if (entry !== null) map[sessionId] = entry;
  }
  return map;
}

/** [[bugfixes]] #1 — prune entries older than 7 days on every write, so a
 * shared file never grows the way 142 individual marker files did. */
function pruneStaleEntries(map: WrapStateMap, nowMs: number): WrapStateMap {
  return Object.fromEntries(
    Object.entries(map).filter(([, entry]) => nowMs - entry.ts <= SEVEN_DAYS_MS),
  );
}

function withoutSession(map: WrapStateMap, sessionId: string): WrapStateMap {
  return Object.fromEntries(Object.entries(map).filter(([id]) => id !== sessionId));
}

async function writeWrapStateMap(
  fs: FileSystem,
  path: AbsPath,
  map: WrapStateMap,
  nowMs: number,
): Promise<void> {
  await fs.writeFile(path, JSON.stringify(pruneStaleEntries(map, nowMs)));
}

export const handleWrapGate: HookHandler<WrapGatePayload> = async (context, payload) => {
  if (payload.stopHookActive) return { kind: HookResultKind.Silent }; // never loop

  const { container, config, workspace, cwd } = context;
  const sessionId =
    payload.sessionId !== null && payload.sessionId !== ""
      ? payload.sessionId
      : DEFAULT_SESSION_ID;

  const statusPorcelainRaw = await container.git.statusPorcelain(cwd);
  const dirtyCount = statusPorcelainRaw
    .split(/\r\n|\r|\n/)
    .filter((line) => line.trim() !== "").length;

  const markerPath = joinAbsPath(parentDir(workspace.indexDb), WRAP_STATE_FILENAME);

  if (dirtyCount === 0) {
    try {
      const existingMap = await readWrapStateMap(container.fs, markerPath);
      if (sessionId in existingMap) {
        await writeWrapStateMap(
          container.fs,
          markerPath,
          withoutSession(existingMap, sessionId),
          container.clock.nowMs(),
        );
      }
    } catch {
      // wrap-gate.py:66-69 — best-effort cleanup only.
    }
    return { kind: HookResultKind.Silent }; // nothing uncommitted to capture
  }

  const headRaw = (await container.git.revParse(cwd, ["HEAD"])).trim();
  const head = (headRaw === "" ? NO_GIT_HEAD : headRaw).slice(0, HEAD_LENGTH);
  const sig = `${head}:${dirtyCount}`;

  const slug = await worktreeSlug(container.git, cwd, workspace);
  const state = statePath(workspace, slug);
  let stateMtimeMs = 0;
  try {
    if (await container.fs.exists(state)) {
      stateMtimeMs = (await container.fs.stat(state)).mtimeMs;
    }
  } catch {
    stateMtimeMs = 0;
  }

  const stateMap = await readWrapStateMap(container.fs, markerPath);
  const previous = stateMap[sessionId];

  // Already captured: STATE refreshed after our last prompt for this signature.
  if (previous !== undefined && previous.sig === sig && stateMtimeMs > previous.ts) {
    return { kind: HookResultKind.Silent };
  }

  const nudges = previous !== undefined && previous.sig === sig ? previous.nudges + 1 : 1;
  const nowMs = container.clock.nowMs();
  try {
    await writeWrapStateMap(
      container.fs,
      markerPath,
      { ...stateMap, [sessionId]: { sig, ts: nowMs, nudges } },
      nowMs,
    );
  } catch {
    // wrap-gate.py:90-95 — best-effort persistence only.
  }

  const gateInput = { slug, dirtyCount };
  const shouldBlock =
    !config.gateDisabled &&
    nudges >= config.blockAfter &&
    dirtyCount >= config.blockDrift;
  if (shouldBlock) {
    return { kind: HookResultKind.Block, reason: renderBlockReason(gateInput) };
  }
  return {
    kind: HookResultKind.Context,
    event: HookEvent.Stop,
    text: renderNudge(gateInput),
  };
};
