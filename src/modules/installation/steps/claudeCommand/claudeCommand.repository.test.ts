import { describe, expect, test } from "bun:test";

import { absPath } from "@/core/index.ts";
import type { AbsPath } from "@/core/index.ts";
import { ClaudeCommandService } from "@/modules/installation/steps/claudeCommand/claudeCommand.repository.ts";
import { PRE_CCMEMORY_BACKUP_SUFFIX } from "@/modules/installation/steps/manifest/manifest.constants.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

// SAFETY: fixed literal test fixture path, never a real filesystem lookup.
const HOME = "/home/test" as AbsPath;
// SAFETY: fixed literal test fixture path, never a real filesystem lookup.
const SOURCE = "/repo/src/commands/ccmemory.md" as AbsPath;

function makeService() {
  const fs = makeFsMemoryFake();
  const service = new ClaudeCommandService(makeAppContext({ fs }));
  return { fs, service };
}

describe("ClaudeCommandService", () => {
  test("defaultTargetPath lands in ~/.claude/commands as ccmemory.md", () => {
    expect(String(ClaudeCommandService.defaultTargetPath(HOME))).toBe(
      "/home/test/.claude/commands/ccmemory.md",
    );
  });

  test("install symlinks the command file into the commands dir", async () => {
    const { fs, service } = makeService();
    await fs.writeFile(SOURCE, "command content");

    const backedUp = await service.install(
      SOURCE,
      ClaudeCommandService.defaultTargetPath(HOME),
    );

    expect(backedUp).toBe(false);
    const target = ClaudeCommandService.defaultTargetPath(HOME);
    expect(await fs.exists(target)).toBe(true);
    // SAFETY: the fake stores symlink targets as link contents.
    expect(await fs.readFile(target)).toBe(SOURCE);
  });

  test("a pre-existing REAL command file is backed up once and reported", async () => {
    const { fs, service } = makeService();
    await fs.writeFile(SOURCE, "command content");
    const target = ClaudeCommandService.defaultTargetPath(HOME);
    await fs.writeFile(target, "user's own ccmemory command");

    const backedUpFirst = await service.install(SOURCE, target);
    expect(backedUpFirst).toBe(true);
    expect(await fs.exists(absPath(`${target}${PRE_CCMEMORY_BACKUP_SUFFIX}`))).toBe(true);

    // A rerun must not clobber or duplicate the backup.
    const backedUpSecond = await service.install(SOURCE, target);
    expect(backedUpSecond).toBe(false);
    // SAFETY: the fake stores symlink targets as link contents.
    expect(await fs.readFile(`${target}${PRE_CCMEMORY_BACKUP_SUFFIX}` as AbsPath)).toBe(
      "user's own ccmemory command",
    );
  });

  test("uninstall removes the link and restores a pre-existing backup", async () => {
    const { fs, service } = makeService();
    await fs.writeFile(SOURCE, "command content");
    const target = ClaudeCommandService.defaultTargetPath(HOME);
    await fs.writeFile(target, "user's own ccmemory command");
    await service.install(SOURCE, target);

    await service.uninstall(target);

    expect(await fs.exists(target)).toBe(true);
    expect(await fs.readFile(target)).toBe("user's own ccmemory command");
    expect(await fs.exists(absPath(`${target}${PRE_CCMEMORY_BACKUP_SUFFIX}`))).toBe(
      false,
    );
  });
});
