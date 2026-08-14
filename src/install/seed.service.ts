import type { AbsPath } from "../core/AbsPath.ts";
import type { FileSystem } from "../platform/fileSystem.typedefs.ts";
import { defaultRegistryPath } from "../workspace/registry.service.ts";

/**
 * Seed `~/.claude/memory/registry.toml` from `<repo>/registry.example.toml`
 * IF one doesn't already exist — never overwrites a real registry.
 */

const EXAMPLE_REGISTRY_RELATIVE_PATH = "registry.example.toml";

export function defaultExampleRegistryPath(repoRoot: AbsPath): AbsPath {
  // SAFETY: appending a fixed literal filename onto an already-absolute,
  // normalized `repoRoot`.
  return `${repoRoot}/${EXAMPLE_REGISTRY_RELATIVE_PATH}` as AbsPath;
}

/** The parent directory of an already-absolute, normalized `AbsPath` — see
 * `registry.service.ts`'s `parentDir` doc comment. */
function parentDirectory(path: AbsPath): AbsPath {
  const lastSlashIndex = path.lastIndexOf("/");
  const sliced = lastSlashIndex <= 0 ? "/" : path.slice(0, lastSlashIndex);
  // SAFETY: slicing an absolute, normalized path at a `/` boundary yields
  // another absolute, normalized path (or the root `/`).
  return sliced as AbsPath;
}

export type SeedRegistryOutcome = {
  readonly seeded: boolean;
  readonly actionLine: string;
};

export async function seedRegistry(
  fs: FileSystem,
  repoRoot: AbsPath,
  home: AbsPath,
): Promise<SeedRegistryOutcome> {
  const registryPath = defaultRegistryPath(home);
  if (await fs.exists(registryPath)) {
    return { seeded: false, actionLine: "registry exists (left as-is)" };
  }
  const examplePath = defaultExampleRegistryPath(repoRoot);
  const content = await fs.readFile(examplePath);
  await fs.mkdir(parentDirectory(registryPath));
  await fs.writeFile(registryPath, content);
  return {
    seeded: true,
    actionLine: `seeded registry -> ${registryPath} (edit paths / run \`memory workspace add\`)`,
  };
}
