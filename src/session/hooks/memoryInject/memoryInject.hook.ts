import type { AbsPath, Config, Workspace } from "@/core/index.ts";
import type { Container, FileSystem } from "@/platform/index.ts";
import type { FusedHit } from "@/retrieval/index.ts";
import { SearchKind, SearchService, TokenizerParser } from "@/retrieval/index.ts";
import {
  INJECT_LOG_FILENAME,
  KEPT_LOG_GENERATIONS,
  MAX_INJECTED_NOTES,
  MAX_INJECTED_WORKLOGS,
  MAX_INJECT_LOG_BYTES,
  MAX_LOGGED_PROMPT_LENGTH,
  MAX_LOGGED_TOKENS,
  MIN_PROMPT_LENGTH,
  MIN_SALIENT_TOKENS,
  NOTES_POOL_SIZE,
} from "@/session/hooks/memoryInject/memoryInject.constants.ts";
import type { MemoryInjectFormatter } from "@/session/hooks/memoryInject/memoryInject.formatter.ts";
import type {
  CandidateLogEntry,
  InjectedHit,
} from "@/session/hooks/memoryInject/memoryInject.typedefs.ts";
import type { MemoryInjectPayload } from "@/session/payload/payload.typedefs.ts";
import type { HookHandler, HookInput } from "@/session/runtime/runtime.typedefs.ts";
import { HookEvent, HookResultKind } from "@/session/session.typedefs.ts";
import type { HookResult } from "@/session/session.typedefs.ts";

/**
 * `UserPromptSubmit`: auto-retrieve relevant memory for the prompt via a
 * fused BM25 search, gated by prompt length, salient-token count and a score
 * floor. `inject.jsonl` records the full candidate pool on EVERY call that
 * reaches it — even one that ends up injecting nothing — which is why the
 * log write happens before the emptiness check below.
 */

function parentDir(path: AbsPath): AbsPath {
  const lastSlashIndex = path.lastIndexOf("/");
  const sliced = lastSlashIndex <= 0 ? "/" : path.slice(0, lastSlashIndex);
  // SAFETY: slicing an absolute, normalized path at a `/` boundary yields
  // another absolute, normalized path.
  return sliced as AbsPath;
}

function joinAbsPath(base: AbsPath, name: string): AbsPath {
  // `base` is exactly the filesystem root ("/") when `parentDir` had nothing
  // to strip (e.g. a test's `indexDb: ":memory:"`, whose "directory" is the
  // fixed fallback `"/"`) — appending a plain `/${name}` there would double
  // the slash (`"//inject.jsonl"`), a distinct path from `"/inject.jsonl"`.
  const separator = base.endsWith("/") ? "" : "/";
  const joined = `${base}${separator}${name}`;
  // SAFETY: `base` is an already-absolute, normalized `AbsPath`; `name` is
  // the fixed literal `"inject.jsonl"`.
  return joined as AbsPath;
}

/** Every indexed path is always under `ws.kb`/`ws.worklogs`, so this is
 * prefix-stripping, not full relpath resolution. */
function relativeOrAbsolute(path: AbsPath, base: AbsPath): string {
  const prefix = `${base}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/** Rounds a score to 4 decimal places for the log entry. */
function round4(value: number): number {
  return Number(value.toFixed(4));
}

function toCandidateLogEntries(
  hits: readonly FusedHit[],
  base: AbsPath,
): readonly CandidateLogEntry[] {
  return hits.map((hit) => ({
    p: relativeOrAbsolute(hit.path, base),
    s: round4(hit.score),
  }));
}

async function currentLogSize(fs: FileSystem, path: AbsPath): Promise<number> {
  try {
    return (await fs.stat(path)).size;
  } catch {
    return 0;
  }
}

// Rotation must happen in strict generation order (newest first): each rename
// depends on the previous one having completed, so this cannot be a
// `Promise.all` over independent iterations the way the lint rule expects.
async function rotateInjectLog(fs: FileSystem, path: AbsPath): Promise<void> {
  for (let generation = KEPT_LOG_GENERATIONS; generation >= 1; generation -= 1) {
    // SAFETY: `path` is an already-absolute, normalized `AbsPath`; appending a
    // fixed `.<generation>` numeric suffix keeps it absolute and normalized.
    const from = generation === 1 ? path : (`${path}.${generation - 1}` as AbsPath);
    // SAFETY: same reasoning as `from` above.
    const to = `${path}.${generation}` as AbsPath;
    // eslint-disable-next-line no-await-in-loop
    const fromExists = await fs.exists(from);
    if (!fromExists) continue;
    if (generation === KEPT_LOG_GENERATIONS) {
      // eslint-disable-next-line no-await-in-loop
      await fs.remove(to);
    }
    // eslint-disable-next-line no-await-in-loop
    await fs.rename(from, to);
  }
}

async function appendInjectLogLine(
  fs: FileSystem,
  path: AbsPath,
  line: string,
): Promise<void> {
  const encoded = `${line}\n`;
  const projectedSize =
    (await currentLogSize(fs, path)) + new TextEncoder().encode(encoded).length;
  if (projectedSize > MAX_INJECT_LOG_BYTES) {
    await rotateInjectLog(fs, path);
  }
  await fs.appendFile(path, encoded);
}

function toInjectedHit(hit: FusedHit, base: AbsPath): InjectedHit {
  return {
    title: hit.title,
    snippet: hit.snippet,
    relativePath: relativeOrAbsolute(hit.path, base),
  };
}

export class MemoryInjectHook implements HookHandler<MemoryInjectPayload> {
  constructor(
    private readonly container: Container,
    private readonly config: Config,
    private readonly formatter: MemoryInjectFormatter,
    private readonly searchService: SearchService = new SearchService(),
    private readonly tokenizerParser: TokenizerParser = new TokenizerParser(),
  ) {}

  private async logInjectCandidates(
    workspace: Workspace,
    cwd: AbsPath,
    prompt: string,
    tokens: ReadonlySet<string>,
    notePool: readonly FusedHit[],
    worklogPool: readonly FusedHit[],
    injectedNotes: readonly FusedHit[],
    injectedWorklogs: readonly FusedHit[],
  ): Promise<void> {
    if (!this.config.injectLogEnabled) return; // CCMEM_INJECT_LOG=0
    try {
      const record = {
        ts: new Date(this.container.clock.nowMs()).toISOString(),
        ws: workspace.id,
        cwd,
        prompt: prompt.slice(0, MAX_LOGGED_PROMPT_LENGTH),
        tokens: [...tokens].toSorted().slice(0, MAX_LOGGED_TOKENS),
        candidates: toCandidateLogEntries(notePool, workspace.kb),
        worklog: toCandidateLogEntries(worklogPool, workspace.worklogs),
        injected: {
          notes: injectedNotes.map((hit) => relativeOrAbsolute(hit.path, workspace.kb)),
          worklog: injectedWorklogs.map((hit) =>
            relativeOrAbsolute(hit.path, workspace.worklogs),
          ),
        },
      };
      const logPath = joinAbsPath(parentDir(workspace.indexDb), INJECT_LOG_FILENAME);
      await appendInjectLogLine(this.container.fs, logPath, JSON.stringify(record));
    } catch {
      // logging failures never propagate.
    }
  }

  async handle(payload: HookInput<MemoryInjectPayload>): Promise<HookResult> {
    const { workspace, cwd } = payload;
    const prompt = payload.prompt.trim();
    if (prompt.length < MIN_PROMPT_LENGTH) return { kind: HookResultKind.Silent };

    const tokens = this.tokenizerParser.salientTokens(prompt);
    if (tokens.size < MIN_SALIENT_TOKENS) return { kind: HookResultKind.Silent };

    let notePool: readonly FusedHit[];
    let worklogPool: readonly FusedHit[];
    try {
      notePool = await this.searchService.searchFused(this.container, workspace, prompt, {
        limit: NOTES_POOL_SIZE,
        kind: SearchKind.Notes,
        linkBoost: this.config.linkBoost,
      });
      worklogPool = await this.searchService.searchFused(
        this.container,
        workspace,
        prompt,
        {
          limit: MAX_INJECTED_WORKLOGS,
          kind: SearchKind.Worklog,
          linkBoost: this.config.linkBoost,
        },
      );
    } catch {
      // a search failure returns silently, before any logging happens.
      return { kind: HookResultKind.Silent };
    }

    const injectedNotes = notePool
      .filter((hit) => -hit.score >= this.config.injectMinScore)
      .slice(0, MAX_INJECTED_NOTES);
    const injectedWorklogs = worklogPool
      .filter((hit) => -hit.score >= this.config.injectMinScore)
      .slice(0, MAX_INJECTED_WORKLOGS);

    // logged even when nothing gets injected.
    await this.logInjectCandidates(
      workspace,
      cwd,
      prompt,
      tokens,
      notePool,
      worklogPool,
      injectedNotes,
      injectedWorklogs,
    );

    if (injectedNotes.length === 0 && injectedWorklogs.length === 0) {
      return { kind: HookResultKind.Silent };
    }

    const text = this.formatter.formatInjectContext({
      workspaceId: workspace.id,
      notes: injectedNotes.map((hit) => toInjectedHit(hit, workspace.kb)),
      worklogs: injectedWorklogs.map((hit) => toInjectedHit(hit, workspace.worklogs)),
    });
    return { kind: HookResultKind.Context, event: HookEvent.UserPromptSubmit, text };
  }
}
