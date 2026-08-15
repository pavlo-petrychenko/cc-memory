import type { AbsPath } from "@/core/index.ts";
import { absPath, expandPath, joinAbs } from "@/core/index.ts";
import { PRE_CCMEMORY_BACKUP_SUFFIX } from "@/install/steps/manifest/manifest.constants.ts";
import type { SkillManifestEntry } from "@/install/steps/manifest/manifest.typedefs.ts";
import { SKILLS_TARGET_HOME_RELATIVE_PATH } from "@/install/steps/skills/skills.constants.ts";
import type { SkillInstallOutcome } from "@/install/steps/skills/skills.typedefs.ts";
import type { FileSystem } from "@/platform/index.ts";

/** Symlinks every skill under `<repo>/src/skills` into `~/.claude/skills`, backing
 * up a pre-existing REAL directory to `<name>.pre-ccmemory.bak` once. Idempotency
 * is decided from the MANIFEST, not `readlink`/`lstat` (the `FileSystem` port has
 * neither): a skill already recorded is trusted and left alone. */
export class SkillsService {
  constructor(private readonly fs: FileSystem) {}

  static defaultTargetDir(home: AbsPath): AbsPath {
    return expandPath(SKILLS_TARGET_HOME_RELATIVE_PATH, home);
  }

  private static backupPathFor(targetPath: AbsPath): AbsPath {
    return absPath(`${targetPath}${PRE_CCMEMORY_BACKUP_SUFFIX}`);
  }

  async discoverNames(skillsSourceDir: AbsPath): Promise<readonly string[]> {
    if (!(await this.fs.exists(skillsSourceDir))) return [];
    const names = await this.fs.readDir(skillsSourceDir);
    const isDirectoryFlags = await Promise.all(
      names.map((name) =>
        this.fs.stat(joinAbs(skillsSourceDir, name)).then((stat) => stat.isDirectory),
      ),
    );
    const directoryNames = names.filter(
      (_name, index) => isDirectoryFlags[index] === true,
    );
    return directoryNames.toSorted();
  }

  private async installOne(
    sourcePath: AbsPath,
    targetPath: AbsPath,
    previousEntry: SkillManifestEntry | undefined,
  ): Promise<SkillManifestEntry> {
    if (previousEntry !== undefined) {
      if (!(await this.fs.exists(targetPath))) {
        await this.fs.symlink(sourcePath, targetPath);
      }
      return previousEntry;
    }

    let backedUp = false;
    if (await this.fs.exists(targetPath)) {
      const backupPath = SkillsService.backupPathFor(targetPath);
      if (!(await this.fs.exists(backupPath))) {
        await this.fs.rename(targetPath, backupPath);
      } else {
        await this.fs.remove(targetPath);
      }
      backedUp = true;
    }
    await this.fs.symlink(sourcePath, targetPath);
    return { name: targetPath.slice(targetPath.lastIndexOf("/") + 1), backedUp };
  }

  async install(
    skillsSourceDir: AbsPath,
    skillsTargetDir: AbsPath,
    skillNames: readonly string[],
    previousSkills: readonly SkillManifestEntry[],
  ): Promise<SkillInstallOutcome> {
    await this.fs.mkdir(skillsTargetDir);
    const previousByName = new Map(previousSkills.map((entry) => [entry.name, entry]));

    const skills = await Promise.all(
      skillNames.map((name) =>
        this.installOne(
          joinAbs(skillsSourceDir, name),
          joinAbs(skillsTargetDir, name),
          previousByName.get(name),
        ),
      ),
    );
    const actionLines = skillNames.map((name) => `skill ${name}`);
    return { skills, actionLines };
  }
}
