import { describe, expect, test } from "bun:test";

import type { AbsPath } from "@/core/index.ts";
import { PiExtensionService } from "@/modules/installation/steps/piExtension/piExtension.repository.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

// SAFETY: fixed literal test fixture path, never a real filesystem lookup.
const HOME = "/home/test" as AbsPath;
// SAFETY: fixed literal test fixture path, never a real filesystem lookup.
const DIST = "/repo/dist/ccMemoryExtension.js" as AbsPath;

function makeService() {
  const fs = makeFsMemoryFake();
  const service = new PiExtensionService(makeAppContext({ fs }));
  return { fs, service };
}

describe("PiExtensionService", () => {
  test("defaultPath lands in ~/.pi/agent/extensions as cc-memory.js", () => {
    expect(String(PiExtensionService.defaultPath(HOME))).toBe(
      "/home/test/.pi/agent/extensions/cc-memory.js",
    );
  });

  test("install copies the bundle bytes and creates the parent directory", async () => {
    const { fs, service } = makeService();
    await fs.writeFile(DIST, "extension bundle");

    await service.install(DIST, PiExtensionService.defaultPath(HOME));

    const target = PiExtensionService.defaultPath(HOME);
    expect(await fs.exists(target)).toBe(true);
    expect(await fs.readFile(target)).toBe("extension bundle");
  });

  test("a rerun overwrites the previous copy instead of failing", async () => {
    const { fs, service } = makeService();
    await fs.writeFile(DIST, "first bundle");
    await service.install(DIST, PiExtensionService.defaultPath(HOME));
    await fs.writeFile(DIST, "rebuilt bundle");

    await service.install(DIST, PiExtensionService.defaultPath(HOME));

    expect(await fs.readFile(PiExtensionService.defaultPath(HOME))).toBe(
      "rebuilt bundle",
    );
  });

  test("remove deletes an installed extension", async () => {
    const { fs, service } = makeService();
    await fs.writeFile(DIST, "extension bundle");
    await service.install(DIST, PiExtensionService.defaultPath(HOME));

    await service.remove(PiExtensionService.defaultPath(HOME));

    expect(await fs.exists(PiExtensionService.defaultPath(HOME))).toBe(false);
  });
});
