import type { AbsPath } from "@/core/index.ts";
import { absPath, parentDir, registryPath } from "@/core/index.ts";
import type { RawWorkspace, Workspace, WorktreeSlug } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import type { FileSystem } from "@/gateways/fileSystem/fileSystem.typedefs.ts";
import type { Git } from "@/gateways/git/git.typedefs.ts";
import { WorkspaceParser } from "@/modules/workspace/workspace.parser.ts";
import { WorkspaceResolverService } from "@/modules/workspace/workspace.resolver.service.ts";
import { WorkspaceSerializer } from "@/modules/workspace/workspace.serializer.ts";
import type { RegistryError } from "@/modules/workspace/workspace.typedefs.ts";

/** The workspace registry — the source of truth this module owns. The ONLY
 * layer here that touches the filesystem or git. */
export class WorkspaceRepository {
  constructor(
    private readonly fs: FileSystem,
    private readonly git: Git,
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
}
