import { describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/index.ts";
import { SeedService } from "@/modules/installation/steps/seed/seed.service.ts";
import { defaultRegistryPath } from "@/modules/workspace/index.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";

// SAFETY: fixed test fixtures, never a real filesystem lookup — matches
// `testGateways.fixture.ts`'s `DEFAULT_HOME`.
const HOME = "/home/test" as AbsPath;
// SAFETY: same reasoning as `HOME` above.
const REPO_ROOT = "/repo" as AbsPath;

describe("SeedService — seeding registry.toml from registry.example.toml", () => {
  test("seeds the registry when none exists yet", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(
      SeedService.defaultExampleRegistryPath(REPO_ROOT),
      '[[workspace]]\nid = "example"\n',
    );
    const service = new SeedService(fs);

    const outcome = await service.seed(REPO_ROOT, HOME);

    expect(outcome.seeded).toBe(true);
    expect(outcome.actionLine).toContain("seeded registry ->");
    const written = await fs.readFile(defaultRegistryPath(HOME));
    expect(written).toBe('[[workspace]]\nid = "example"\n');
  });

  test("leaves an existing registry untouched", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(
      SeedService.defaultExampleRegistryPath(REPO_ROOT),
      '[[workspace]]\nid = "example"\n',
    );
    fs.seedFile(defaultRegistryPath(HOME), '[[workspace]]\nid = "real"\n');
    const service = new SeedService(fs);

    const outcome = await service.seed(REPO_ROOT, HOME);

    expect(outcome.seeded).toBe(false);
    expect(outcome.actionLine).toBe("registry exists (left as-is)");
    const content = await fs.readFile(defaultRegistryPath(HOME));
    expect(content).toBe('[[workspace]]\nid = "real"\n');
  });
});
