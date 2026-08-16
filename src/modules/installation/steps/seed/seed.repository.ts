import type { AppContext } from "@/core/base/context.typedefs.ts";
import { Service } from "@/core/index.ts";
import type { AbsPath } from "@/core/index.ts";
import { joinAbs, parentDir } from "@/core/index.ts";
import { registryPath } from "@/core/index.ts";
import type { FileSystem } from "@/gateways/index.ts";
import { EXAMPLE_REGISTRY_RELATIVE_PATH } from "@/modules/installation/steps/seed/seed.constants.ts";
import type { SeedRegistryOutcome } from "@/modules/installation/steps/seed/seed.typedefs.ts";

/** Seeds `registry.toml` from `registry.example.toml` IF one doesn't already
 * exist — never overwrites a real registry. */
export class SeedService extends Service {
  private readonly fs: FileSystem;

  constructor(ctx: AppContext) {
    super(ctx);
    this.fs = ctx.gateways.fs;
  }

  static defaultExampleRegistryPath(repoRoot: AbsPath): AbsPath {
    return joinAbs(repoRoot, EXAMPLE_REGISTRY_RELATIVE_PATH);
  }

  async seed(repoRoot: AbsPath, home: AbsPath): Promise<SeedRegistryOutcome> {
    const targetRegistryPath = registryPath(home);
    if (await this.fs.exists(targetRegistryPath)) {
      return { seeded: false, actionLine: "registry exists (left as-is)" };
    }
    const examplePath = SeedService.defaultExampleRegistryPath(repoRoot);
    const content = await this.fs.readFile(examplePath);
    await this.fs.mkdir(parentDir(targetRegistryPath));
    await this.fs.writeFile(targetRegistryPath, content);
    return {
      seeded: true,
      actionLine: `seeded registry -> ${targetRegistryPath} (edit paths / run \`memory workspace add\`)`,
    };
  }
}
