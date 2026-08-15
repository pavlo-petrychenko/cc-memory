import type { WorkspaceAddArgs, WorkspaceRmArgs } from "@/cli/index.ts";
import { CLI_SUCCESS, cliFailure } from "@/core/index.ts";
import type { AbsPath, CliOutcome } from "@/core/index.ts";
import { expandPath, titleize, tildify } from "@/core/index.ts";
import type { RawWorkspace, Workspace } from "@/core/index.ts";
import type { Env, FileSystem, Proc, Stdio } from "@/platform/index.ts";
import {
  DEFAULT_EXCLUDE,
  GIT_INIT_TIMEOUT_MS,
  GITIGNORE_CONTENT,
  HOME_NOTE_BODY_PREFIX,
  HOME_NOTE_BODY_SUFFIX,
  HOME_NOTE_HEADER_PREFIX,
  HOME_NOTE_HEADER_SUFFIX,
  NO_WORKSPACES_MESSAGE,
} from "@/workspace/commands/workspace/workspace.constants.ts";
import { WorkspaceFormatter } from "@/workspace/commands/workspace/workspace.formatter.ts";
import type { WorkspaceLsRow } from "@/workspace/commands/workspace/workspace.typedefs.ts";
import { RegistryService } from "@/workspace/services/registry/index.ts";
import { TargetResolutionService } from "@/workspace/targetResolution/index.ts";
import type { WorkspaceIndexBuilder } from "@/workspace/workspace.typedefs.ts";

function homeNoteContent(title: string, id: string): string {
  // The vault's home note content, written once at workspace creation.
  return (
    `${HOME_NOTE_HEADER_PREFIX}${title}${HOME_NOTE_HEADER_SUFFIX}` +
    `${HOME_NOTE_BODY_PREFIX}${id}${HOME_NOTE_BODY_SUFFIX}`
  );
}

/** The parent directory of an already-absolute, normalized `AbsPath` — the
 * same small utility `workspace/services/registry` and
 * `retrieval/store/connection` each keep a private copy of rather than
 * sharing (an established pattern in this codebase for a 3-line
 * path-slicing helper). */
function parentDirectory(path: AbsPath): AbsPath {
  const lastSlashIndex = path.lastIndexOf("/");
  const sliced = lastSlashIndex <= 0 ? "/" : path.slice(0, lastSlashIndex);
  // SAFETY: slicing an absolute, normalized path at a `/` boundary yields
  // another absolute, normalized path (or the root `/`).
  return sliced as AbsPath;
}

/** Join a fixed literal segment onto an already-absolute, normalized
 * `AbsPath` — every call site below passes a hard-coded segment with no `/`,
 * `.` or `..` of its own (`.obsidian`, `.gitignore`, `.git`, `<title>.md`),
 * so the result is always another absolute, normalized path. */
function joinFixedSegment(base: AbsPath, segment: string): AbsPath {
  // SAFETY: see the doc comment above.
  return `${base}/${segment}` as AbsPath;
}

/**
 * The `memory workspace add|rm|ls` subcommands.
 */
export class WorkspaceCommand {
  constructor(
    private readonly fs: FileSystem,
    private readonly env: Env,
    private readonly proc: Proc,
    private readonly stdio: Stdio,
    private readonly registryService: RegistryService,
    private readonly targetResolutionService: TargetResolutionService,
    private readonly indexBuilder: WorkspaceIndexBuilder,
    private readonly formatter: WorkspaceFormatter,
  ) {}

  private async isDirectory(path: AbsPath): Promise<boolean> {
    try {
      return (await this.fs.stat(path)).isDirectory;
    } catch {
      return false;
    }
  }

  private defaultRegistryPathFor(): AbsPath {
    return expandPath("~/.claude/memory/registry.toml", this.env.home());
  }

  /** Returns `"?"` unless the index file exists and its note count can be read
   * successfully. Written as a standalone async helper (not a literal loop
   * body) so `ls` can fan the per-workspace reads out via `Promise.all`
   * instead of `await`-ing sequentially in a `for` loop. */
  private async countNotesOrUnknown(ws: Workspace): Promise<string> {
    try {
      if (!(await this.fs.exists(ws.indexDb))) return "?";
      if (!(await this.fs.stat(ws.indexDb)).isFile) return "?";
      return String(await this.indexBuilder.noteCount(ws));
    } catch {
      return "?";
    }
  }

  private async buildWorkspaceLsRow(
    home: AbsPath,
    raw: RawWorkspace,
  ): Promise<WorkspaceLsRow> {
    const ws = this.registryService.expandWorkspace(raw, home);
    const noteCountText = await this.countNotesOrUnknown(ws);
    return {
      summaryLine: this.formatter.workspaceLsRow(raw.id, ws.kb, noteCountText),
      matchLine: this.formatter.workspaceLsMatch(ws.match),
    };
  }

  /** Validate against every existing workspace, scaffold the vault (dirs,
   * `.gitignore`, home note, `git init`), register it, then build its index
   * once so the printed note count is real. */
  async add(args: WorkspaceAddArgs): Promise<CliOutcome> {
    const home = this.env.home();
    const registryResult = await this.targetResolutionService.loadRegistryForCli(home);
    if (!registryResult.ok) return registryResult.error;
    const existing = registryResult.value;

    const title = titleize(args.id);
    const kb = expandPath(args.kb ?? `~/Documents/${title} Vault`, home);
    const worklogs =
      args.worklogs !== null
        ? expandPath(args.worklogs, home)
        : joinFixedSegment(kb, "_Worklogs");
    const indexDb = expandPath(`~/.claude/memory/${args.id}/index.db`, home);
    const match = args.match.map((entry) => expandPath(entry, home));
    const exclude =
      args.exclude !== null && args.exclude.length > 0 ? args.exclude : DEFAULT_EXCLUDE;

    const candidate: RawWorkspace = {
      id: args.id,
      match,
      kb,
      worklogs,
      exclude,
      indexDb,
    };
    const conflicts = this.registryService.validateNew(candidate, existing, home);
    if (conflicts.length > 0) {
      return cliFailure(`workspace '${args.id}' conflicts with an existing workspace`);
    }

    await this.fs.mkdir(kb);
    await this.fs.mkdir(joinFixedSegment(kb, ".obsidian"));
    await this.fs.mkdir(worklogs);
    await this.fs.mkdir(parentDirectory(indexDb));

    const gitignorePath = joinFixedSegment(kb, ".gitignore");
    if (!(await this.fs.exists(gitignorePath))) {
      await this.fs.writeFile(gitignorePath, GITIGNORE_CONTENT);
    }
    const homeNotePath = joinFixedSegment(kb, `${title}.md`);
    if (!(await this.fs.exists(homeNotePath))) {
      await this.fs.writeFile(homeNotePath, homeNoteContent(title, args.id));
    }
    const gitDirPath = joinFixedSegment(kb, ".git");
    if (!(await this.isDirectory(gitDirPath))) {
      await this.proc.run("git", ["-C", kb, "init", "-q"], {
        timeoutMs: GIT_INIT_TIMEOUT_MS,
      });
    }

    const stored: RawWorkspace = {
      id: candidate.id,
      match: match.map((entry) => tildify(entry, home)),
      kb: tildify(kb, home),
      worklogs: tildify(worklogs, home),
      exclude: candidate.exclude,
      indexDb: tildify(indexDb, home),
    };
    await this.registryService.save(this.defaultRegistryPathFor(), [...existing, stored]);
    const total = await this.indexBuilder.buildIndex(
      this.registryService.expandWorkspace(stored, home),
    );

    for (const line of this.formatter.workspaceAdded(
      args.id,
      kb,
      worklogs,
      indexDb,
      total,
      match,
    )) {
      this.stdio.write(line);
    }
    return CLI_SUCCESS;
  }

  async rm(args: WorkspaceRmArgs): Promise<CliOutcome> {
    const home = this.env.home();
    const registryResult = await this.targetResolutionService.loadRegistryForCli(home);
    if (!registryResult.ok) return registryResult.error;
    const existing = registryResult.value;

    const target = existing.find((raw) => raw.id === args.id);
    if (target === undefined) {
      return cliFailure(this.targetResolutionService.noSuchWorkspaceMessage(args.id));
    }

    const keep = existing.filter((raw) => raw.id !== args.id);
    await this.registryService.save(this.defaultRegistryPathFor(), keep);

    if (args.purge) {
      const expanded = this.registryService.expandWorkspace(target, home);
      // `fs.remove` is recursive+idempotent (fileSystem.typedefs.ts) — it never
      // throws on a missing path.
      await this.fs.remove(expanded.indexDb);
      this.stdio.write(this.formatter.workspaceRemovedPurged(args.id));
    } else {
      this.stdio.write(this.formatter.workspaceUnregistered(args.id));
    }
    return CLI_SUCCESS;
  }

  async ls(): Promise<CliOutcome> {
    const home = this.env.home();
    const registryResult = await this.targetResolutionService.loadRegistryForCli(home);
    if (!registryResult.ok) return registryResult.error;
    const existing = registryResult.value;

    if (existing.length === 0) {
      this.stdio.write(NO_WORKSPACES_MESSAGE);
      return CLI_SUCCESS;
    }

    const rows = await Promise.all(
      existing.map((raw) => this.buildWorkspaceLsRow(home, raw)),
    );
    for (const row of rows) {
      this.stdio.write(row.summaryLine);
      this.stdio.write(row.matchLine);
    }
    return CLI_SUCCESS;
  }
}
