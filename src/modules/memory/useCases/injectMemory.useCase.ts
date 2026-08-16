import { UseCase } from "@/core/index.ts";
import type { AbsPath, FusedHit, Workspace } from "@/core/index.ts";
import { absPath, joinAbs, parentDir } from "@/core/index.ts";
import { TokenizerParser } from "@/core/index.ts";
import { HookEvent, HookResultKind } from "@/core/transport/hook/hook.typedefs.ts";
import type { HookResult } from "@/core/transport/hook/hook.typedefs.ts";
import type { FileSystem } from "@/gateways/index.ts";
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
} from "@/modules/memory/hooks/injectMemory/injectMemory.constants.ts";
import { MemoryInjectFormatter } from "@/modules/memory/hooks/injectMemory/injectMemory.formatter.ts";
import type {
  CandidateLogEntry,
  InjectedHit,
} from "@/modules/memory/hooks/injectMemory/injectMemory.typedefs.ts";
import { NoteService } from "@/modules/note/index.ts";
import { WorklogService } from "@/modules/worklog/index.ts";

export type InjectMemoryInput = {
  readonly workspace: Workspace;
  readonly cwd: AbsPath;
  readonly prompt: string;
};

function relativeOrAbsolute(path: AbsPath, base: AbsPath): string {
  const prefix = `${base}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

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

async function rotateInjectLog(fs: FileSystem, path: AbsPath): Promise<void> {
  for (let generation = KEPT_LOG_GENERATIONS; generation >= 1; generation -= 1) {
    const from = generation === 1 ? path : absPath(`${path}.${generation - 1}`);
    const to = absPath(`${path}.${generation}`);
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

/** `UserPromptSubmit`: auto-retrieve relevant memory via a fused BM25 search,
 * gated by prompt length, salient-token count and a score floor. */
export class InjectMemoryUseCase extends UseCase<InjectMemoryInput, HookResult> {
  private readonly noteService = this.makeService(NoteService);
  private readonly worklogService = this.makeService(WorklogService);
  private readonly formatter = new MemoryInjectFormatter();
  private readonly tokenizerParser = new TokenizerParser();

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
    if (!this.config.injectLogEnabled) return;
    try {
      const record = {
        ts: new Date(this.gateways.clock.nowMs()).toISOString(),
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
      const logPath = joinAbs(parentDir(workspace.indexDb), INJECT_LOG_FILENAME);
      await appendInjectLogLine(this.gateways.fs, logPath, JSON.stringify(record));
    } catch {
      // logging failures never propagate.
    }
  }

  async execute(input: InjectMemoryInput): Promise<HookResult> {
    const { workspace, cwd } = input;
    const prompt = input.prompt.trim();
    if (prompt.length < MIN_PROMPT_LENGTH) return { kind: HookResultKind.Silent };

    const tokens = this.tokenizerParser.salientTokens(prompt);
    if (tokens.size < MIN_SALIENT_TOKENS) return { kind: HookResultKind.Silent };

    let notePool: readonly FusedHit[];
    let worklogPool: readonly FusedHit[];
    try {
      notePool = await this.noteService.search(workspace, prompt, {
        limit: NOTES_POOL_SIZE,
        linkBoost: this.config.linkBoost,
      });
      worklogPool = await this.worklogService.search(workspace, prompt, {
        limit: MAX_INJECTED_WORKLOGS,
        linkBoost: this.config.linkBoost,
      });
    } catch {
      return { kind: HookResultKind.Silent };
    }

    const injectedNotes = notePool
      .filter((hit) => -hit.score >= this.config.injectMinScore)
      .slice(0, MAX_INJECTED_NOTES);
    const injectedWorklogs = worklogPool
      .filter((hit) => -hit.score >= this.config.injectMinScore)
      .slice(0, MAX_INJECTED_WORKLOGS);

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
