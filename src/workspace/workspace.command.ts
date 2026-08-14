import type { WorkspaceAddArgs, WorkspaceRmArgs } from "../cli/args.ts";
import { CLI_SUCCESS, type CliOutcome, cliFailure } from "../cli/CliOutcome.ts";
import {
  formatWorkspaceAdded,
  formatWorkspaceLsMatch,
  formatWorkspaceLsRow,
  formatWorkspaceRemovedPurged,
  formatWorkspaceUnregistered,
  NO_WORKSPACES_MESSAGE,
} from "../cli/format.ts";
import {
  loadRegistryForCli,
  noSuchWorkspaceMessage,
} from "../cli/resolveTarget.service.ts";
import type { AbsPath } from "../core/AbsPath.ts";
import { expandPath, titleize, tildify } from "../core/paths.ts";
import type { RawWorkspace, Workspace } from "../core/Workspace.ts";
import type { Container } from "../platform/container.ts";
import { buildIndex } from "../retrieval/build.service.ts";
import { openIndexDb } from "../retrieval/indexDb.service.ts";
import { expandWorkspace, saveRegistry, validateNew } from "./registry.service.ts";

const DEFAULT_EXCLUDE = ["_Worklogs", "Archive", ".obsidian"];

/** Written only when `<kb>/.gitignore` doesn't exist yet. */
const GITIGNORE_CONTENT = ".obsidian/workspace*\n.obsidian/cache\n.DS_Store\n";

const GIT_INIT_TIMEOUT_MS = 10_000; // matches gitCli.adapter.ts's WRITE_TIMEOUT_MS

function homeNoteContent(title: string, id: string): string {
  // The vault's home note content, written once at workspace creation.
  return (
    `---\ntype: index\n---\n# ${title} — Knowledge Base Index\n\n` +
    `> Knowledge base for the **${id}** workspace.\n`
  );
}

/** The parent directory of an already-absolute, normalized `AbsPath` — the
 * same small utility `services/registry.service.ts`/`retrieval/db.ts`
 * each keep a private copy of rather than sharing (an established pattern in
 * this codebase for a 3-line path-slicing helper). */
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

async function isDirectory(container: Container, path: AbsPath): Promise<boolean> {
  try {
    return (await container.fs.stat(path)).isDirectory;
  } catch {
    return false;
  }
}

function defaultRegistryPathFor(container: Container): AbsPath {
  return expandPath("~/.claude/memory/registry.toml", container.env.home());
}

/** Validate against every existing workspace, scaffold the vault (dirs,
 * `.gitignore`, home note, `git init`), register it, then build its index
 * once so the printed note count is real. */
export async function workspaceAdd(
  container: Container,
  args: WorkspaceAddArgs,
): Promise<CliOutcome> {
  const home = container.env.home();
  const registryResult = await loadRegistryForCli(container.fs, home);
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

  const candidate: RawWorkspace = { id: args.id, match, kb, worklogs, exclude, indexDb };
  const conflicts = validateNew(candidate, existing, home);
  if (conflicts.length > 0) {
    return cliFailure(`workspace '${args.id}' conflicts with an existing workspace`);
  }

  await container.fs.mkdir(kb);
  await container.fs.mkdir(joinFixedSegment(kb, ".obsidian"));
  await container.fs.mkdir(worklogs);
  await container.fs.mkdir(parentDirectory(indexDb));

  const gitignorePath = joinFixedSegment(kb, ".gitignore");
  if (!(await container.fs.exists(gitignorePath))) {
    await container.fs.writeFile(gitignorePath, GITIGNORE_CONTENT);
  }
  const homeNotePath = joinFixedSegment(kb, `${title}.md`);
  if (!(await container.fs.exists(homeNotePath))) {
    await container.fs.writeFile(homeNotePath, homeNoteContent(title, args.id));
  }
  const gitDirPath = joinFixedSegment(kb, ".git");
  if (!(await isDirectory(container, gitDirPath))) {
    await container.proc.run("git", ["-C", kb, "init", "-q"], {
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
  await saveRegistry(container.fs, defaultRegistryPathFor(container), [
    ...existing,
    stored,
  ]);
  const stats = await buildIndex(container, expandWorkspace(stored, home));

  for (const line of formatWorkspaceAdded(
    args.id,
    kb,
    worklogs,
    indexDb,
    stats.total,
    match,
  )) {
    container.stdio.write(line);
  }
  return CLI_SUCCESS;
}

export async function workspaceRm(
  container: Container,
  args: WorkspaceRmArgs,
): Promise<CliOutcome> {
  const home = container.env.home();
  const registryResult = await loadRegistryForCli(container.fs, home);
  if (!registryResult.ok) return registryResult.error;
  const existing = registryResult.value;

  const target = existing.find((raw) => raw.id === args.id);
  if (target === undefined) return cliFailure(noSuchWorkspaceMessage(args.id));

  const keep = existing.filter((raw) => raw.id !== args.id);
  await saveRegistry(container.fs, defaultRegistryPathFor(container), keep);

  if (args.purge) {
    const expanded = expandWorkspace(target, home);
    // `fs.remove` is recursive+idempotent (fileSystem.port.ts) — it never
    // throws on a missing path.
    await container.fs.remove(expanded.indexDb);
    container.stdio.write(formatWorkspaceRemovedPurged(args.id));
  } else {
    container.stdio.write(formatWorkspaceUnregistered(args.id));
  }
  return CLI_SUCCESS;
}

/** Returns `"?"` unless the index file exists and its note count can be read
 * successfully. Written as a standalone async helper (not a literal loop
 * body) so `workspaceLs` can fan the per-workspace reads out via
 * `Promise.all` instead of `await`-ing sequentially in a `for` loop. */
async function countNotesOrUnknown(container: Container, ws: Workspace): Promise<string> {
  try {
    if (!(await container.fs.exists(ws.indexDb))) return "?";
    if (!(await container.fs.stat(ws.indexDb)).isFile) return "?";
    const { db } = await openIndexDb(container, ws);
    const row = db.query<{ "COUNT(*)": number }>("SELECT COUNT(*) FROM notes", [])[0];
    return String(row?.["COUNT(*)"] ?? 0);
  } catch {
    return "?";
  }
}

type WorkspaceLsRow = { readonly summaryLine: string; readonly matchLine: string };

async function buildWorkspaceLsRow(
  container: Container,
  home: AbsPath,
  raw: RawWorkspace,
): Promise<WorkspaceLsRow> {
  const ws = expandWorkspace(raw, home);
  const noteCountText = await countNotesOrUnknown(container, ws);
  return {
    summaryLine: formatWorkspaceLsRow(raw.id, ws.kb, noteCountText),
    matchLine: formatWorkspaceLsMatch(ws.match),
  };
}

export async function workspaceLs(container: Container): Promise<CliOutcome> {
  const home = container.env.home();
  const registryResult = await loadRegistryForCli(container.fs, home);
  if (!registryResult.ok) return registryResult.error;
  const existing = registryResult.value;

  if (existing.length === 0) {
    container.stdio.write(NO_WORKSPACES_MESSAGE);
    return CLI_SUCCESS;
  }

  const rows = await Promise.all(
    existing.map((raw) => buildWorkspaceLsRow(container, home, raw)),
  );
  for (const row of rows) {
    container.stdio.write(row.summaryLine);
    container.stdio.write(row.matchLine);
  }
  return CLI_SUCCESS;
}
