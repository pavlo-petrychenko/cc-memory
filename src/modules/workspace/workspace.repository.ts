import type { AbsPath } from "@/core/index.ts";
import { absPath, joinAbs, parentDir, registryPath } from "@/core/index.ts";
import type { RawWorkspace, Workspace, WorktreeSlug } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import type { FileSystem } from "@/gateways/fileSystem/fileSystem.typedefs.ts";
import type { Git } from "@/gateways/git/git.typedefs.ts";
import type { Proc } from "@/gateways/proc/proc.typedefs.ts";
import {
  GIT_INIT_TIMEOUT_MS,
  GITIGNORE_CONTENT,
  HOME_NOTE_BODY_PREFIX,
  HOME_NOTE_BODY_SUFFIX,
  HOME_NOTE_HEADER_PREFIX,
  HOME_NOTE_HEADER_SUFFIX,
} from "@/modules/workspace/workspace.constants.ts";
import { WorkspaceParser } from "@/modules/workspace/workspace.parser.ts";
import { WorkspaceResolverService } from "@/modules/workspace/workspace.resolver.service.ts";
import { WorkspaceSerializer } from "@/modules/workspace/workspace.serializer.ts";
import type { RegistryError } from "@/modules/workspace/workspace.typedefs.ts";

function homeNoteContent(title: string, id: string): string {
  return (
    `${HOME_NOTE_HEADER_PREFIX}${title}${HOME_NOTE_HEADER_SUFFIX}` +
    `${HOME_NOTE_BODY_PREFIX}${id}${HOME_NOTE_BODY_SUFFIX}`
  );
}

/** The workspace registry — the source of truth this module owns. The ONLY
 * layer here that touches the filesystem, git or subprocesses. */
export class WorkspaceRepository {
  constructor(
    private readonly fs: FileSystem,
    private readonly git: Git,
    private readonly proc: Proc,
    private readonly parser: WorkspaceParser,
    private readonly serializer: WorkspaceSerializer,
    private readonly resolverService: WorkspaceResolverService,
  ) {}

  defaultPath(home: AbsPath): AbsPath {
    return registryPath(home);
  }

  /** A missing file is empty, not an error — only a present file that fails to
   * parse or doesn't match the schema becomes a `RegistryError`. */
  async load(path: AbsPath): Promise<Result<readonly RawWorkspace[], RegistryError>> {
    if (!(await this.fs.exists(path))) return { ok: true, value: [] };
    const stat = await this.fs.stat(path);
    if (!stat.isFile) return { ok: true, value: [] };

    const content = await this.fs.readFile(path);
    return this.parser.parse(content);
  }

  async save(path: AbsPath, workspaces: readonly RawWorkspace[]): Promise<void> {
    await this.fs.mkdir(parentDir(path));
    const tmpAbsPath = absPath(`${path}.tmp`);
    await this.fs.writeFile(tmpAbsPath, this.serializer.serialize(workspaces));
    await this.fs.rename(tmpAbsPath, path);
  }

  async worktreeSlug(cwd: AbsPath, ws: Workspace): Promise<WorktreeSlug> {
    const toplevelOutput = (await this.git.showToplevel(cwd)).trim();
    return this.resolverService.worktreeSlug(toplevelOutput, cwd, ws);
  }

  /** Creates the vault scaffold for a brand-new workspace: kb dirs, a `.gitignore`,
   * a home index note, and a git repo if one doesn't already exist. */
  async scaffold(
    kb: AbsPath,
    worklogs: AbsPath,
    indexDb: AbsPath,
    title: string,
    id: string,
  ): Promise<void> {
    await this.fs.mkdir(kb);
    await this.fs.mkdir(joinAbs(kb, ".obsidian"));
    await this.fs.mkdir(worklogs);
    await this.fs.mkdir(parentDir(indexDb));

    const gitignorePath = joinAbs(kb, ".gitignore");
    if (!(await this.fs.exists(gitignorePath))) {
      await this.fs.writeFile(gitignorePath, GITIGNORE_CONTENT);
    }
    const homeNotePath = joinAbs(kb, `${title}.md`);
    if (!(await this.fs.exists(homeNotePath))) {
      await this.fs.writeFile(homeNotePath, homeNoteContent(title, id));
    }
    const gitDirPath = joinAbs(kb, ".git");
    if (!(await this.isDirectory(gitDirPath))) {
      await this.proc.run("git", ["-C", kb, "init", "-q"], {
        timeoutMs: GIT_INIT_TIMEOUT_MS,
      });
    }
  }

  async purgeIndex(indexDb: AbsPath): Promise<void> {
    await this.fs.remove(indexDb);
  }

  async hasIndexFile(indexDb: AbsPath): Promise<boolean> {
    if (!(await this.fs.exists(indexDb))) return false;
    try {
      return (await this.fs.stat(indexDb)).isFile;
    } catch {
      return false;
    }
  }

  private async isDirectory(path: AbsPath): Promise<boolean> {
    try {
      return (await this.fs.stat(path)).isDirectory;
    } catch {
      return false;
    }
  }
}
