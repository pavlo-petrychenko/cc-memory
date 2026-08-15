import type { AbsPath } from "@/core/index.ts";
import { joinAbs, parentDir } from "@/core/index.ts";
import type { FileSystem } from "@/gateways/index.ts";
import { EXAMPLE_REGISTRY_RELATIVE_PATH } from "@/install/steps/seed/seed.constants.ts";
import type { SeedRegistryOutcome } from "@/install/steps/seed/seed.typedefs.ts";
import { defaultRegistryPath } from "@/workspace/index.ts";

/** Seeds `registry.toml` from `registry.example.toml` IF one doesn't already
 * exist — never overwrites a real registry. */
export class SeedService {
  constructor(private readonly fs: FileSystem) {}

  static defaultExampleRegistryPath(repoRoot: AbsPath): AbsPath {
    return joinAbs(repoRoot, EXAMPLE_REGISTRY_RELATIVE_PATH);
  }

  async seed(repoRoot: AbsPath, home: AbsPath): Promise<SeedRegistryOutcome> {
    const registryPath = defaultRegistryPath(home);
    if (await this.fs.exists(registryPath)) {
      return { seeded: false, actionLine: "registry exists (left as-is)" };
    }
    const examplePath = SeedService.defaultExampleRegistryPath(repoRoot);
    const content = await this.fs.readFile(examplePath);
    await this.fs.mkdir(parentDir(registryPath));
    await this.fs.writeFile(registryPath, content);
    return {
      seeded: true,
      actionLine: `seeded registry -> ${registryPath} (edit paths / run \`memory workspace add\`)`,
    };
  }
}
