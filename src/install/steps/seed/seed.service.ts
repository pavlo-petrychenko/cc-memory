import type { AbsPath } from "@/core/index.ts";
import { EXAMPLE_REGISTRY_RELATIVE_PATH } from "@/install/steps/seed/seed.constants.ts";
import type { SeedRegistryOutcome } from "@/install/steps/seed/seed.typedefs.ts";
import type { FileSystem } from "@/platform/index.ts";
import { defaultRegistryPath } from "@/workspace/index.ts";

/**
 * Seed `~/.claude/memory/registry.toml` from `<repo>/registry.example.toml`
 * IF one doesn't already exist — never overwrites a real registry.
 */
export class SeedService {
  constructor(private readonly fs: FileSystem) {}

  static defaultExampleRegistryPath(repoRoot: AbsPath): AbsPath {
    // SAFETY: appending a fixed literal filename onto an already-absolute,
    // normalized `repoRoot`.
    return `${repoRoot}/${EXAMPLE_REGISTRY_RELATIVE_PATH}` as AbsPath;
  }

  /** The parent directory of an already-absolute, normalized `AbsPath` — see
   * `registry.service.ts`'s `parentDir` doc comment. */
  private static parentDirectory(path: AbsPath): AbsPath {
    const lastSlashIndex = path.lastIndexOf("/");
    const sliced = lastSlashIndex <= 0 ? "/" : path.slice(0, lastSlashIndex);
    // SAFETY: slicing an absolute, normalized path at a `/` boundary yields
    // another absolute, normalized path (or the root `/`).
    return sliced as AbsPath;
  }

  async seed(repoRoot: AbsPath, home: AbsPath): Promise<SeedRegistryOutcome> {
    const registryPath = defaultRegistryPath(home);
    if (await this.fs.exists(registryPath)) {
      return { seeded: false, actionLine: "registry exists (left as-is)" };
    }
    const examplePath = SeedService.defaultExampleRegistryPath(repoRoot);
    const content = await this.fs.readFile(examplePath);
    await this.fs.mkdir(SeedService.parentDirectory(registryPath));
    await this.fs.writeFile(registryPath, content);
    return {
      seeded: true,
      actionLine: `seeded registry -> ${registryPath} (edit paths / run \`memory workspace add\`)`,
    };
  }
}
