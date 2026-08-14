import { describe, expect, test } from "bun:test";

import type { AbsPath } from "../../../src/core/AbsPath.ts";
import {
  defaultExampleRegistryPath,
  seedRegistry,
} from "../../../src/install/seed.service.ts";
import { defaultRegistryPath } from "../../../src/workspace/registry.service.ts";
import { makeFsMemoryFake } from "../../helpers/fakes/fsMemory.fake.ts";

// SAFETY: fixed test fixtures, never a real filesystem lookup — matches
// `tests/helpers/container.ts`'s `DEFAULT_HOME`.
const HOME = "/home/test" as AbsPath;
// SAFETY: same reasoning as `HOME` above.
const REPO_ROOT = "/repo" as AbsPath;

describe("install/seed.ts — seeding registry.toml from registry.example.toml", () => {
  test("seeds the registry when none exists yet", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(defaultExampleRegistryPath(REPO_ROOT), '[[workspace]]\nid = "example"\n');

    const outcome = await seedRegistry(fs, REPO_ROOT, HOME);

    expect(outcome.seeded).toBe(true);
    expect(outcome.actionLine).toContain("seeded registry ->");
    const written = await fs.readFile(defaultRegistryPath(HOME));
    expect(written).toBe('[[workspace]]\nid = "example"\n');
  });

  test("leaves an existing registry untouched", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(defaultExampleRegistryPath(REPO_ROOT), '[[workspace]]\nid = "example"\n');
    fs.seedFile(defaultRegistryPath(HOME), '[[workspace]]\nid = "real"\n');

    const outcome = await seedRegistry(fs, REPO_ROOT, HOME);

    expect(outcome.seeded).toBe(false);
    expect(outcome.actionLine).toBe("registry exists (left as-is)");
    const content = await fs.readFile(defaultRegistryPath(HOME));
    expect(content).toBe('[[workspace]]\nid = "real"\n');
  });
});
