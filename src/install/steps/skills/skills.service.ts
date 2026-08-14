import type { AbsPath } from "@/core/index.ts";
import { expandPath } from "@/core/index.ts";
import {
  PRE_CCMEMORY_BACKUP_SUFFIX,
  type SkillManifestEntry,
} from "@/install/steps/manifest/index.ts";
import { SKILLS_TARGET_HOME_RELATIVE_PATH } from "@/install/steps/skills/skills.constants.ts";
import type { SkillInstallOutcome } from "@/install/steps/skills/skills.typedefs.ts";
import type { FileSystem } from "@/platform/index.ts";

/**
 * Symlink every skill under `<repo>/src/skills` into `~/.claude/skills`,
 * backing up a pre-existing REAL directory to `<name>.pre-ccmemory.bak` once.
 *
 * The `FileSystem` port has no `readlink`/`lstat` (see `fileSystem.typedefs.ts`
 * — it is frozen), so there is no portable way to ask "is `linkPath` already
 * a symlink pointing at `sourcePath`?". Idempotency is decided from the
 * MANIFEST instead: a skill already recorded from a previous install run is
 * trusted to be ours and left alone (re-created only if it has since
 * vanished); a skill with no prior record gets the back-up-if-real-directory
 * treatment before its first link.
 */
export class SkillsService {
  constructor(private readonly fs: FileSystem) {}

  static defaultTargetDir(home: AbsPath): AbsPath {
    return expandPath(SKILLS_TARGET_HOME_RELATIVE_PATH, home);
  }

  /** Join a name `readDir` returned onto an already-validated `AbsPath`
   * directory — same reasoning as `index/build.ts`'s `joinUnderDir`. */
  private static joinUnderDir(dir: AbsPath, name: string): AbsPath {
    // SAFETY: `dir` is an already-absolute, normalized `AbsPath`; `name` is
    // one entry `FileSystem.readDir` returned for it, so the join is another
    // absolute, normalized path directly under `dir`.
    return `${dir}/${name}` as AbsPath;
  }

  private static backupPathFor(targetPath: AbsPath): AbsPath {
    // SAFETY: appending a fixed literal suffix to an absolute, normalized
    // path introduces no `~`, `.` or `..` segment.
    return `${targetPath}${PRE_CCMEMORY_BACKUP_SUFFIX}` as AbsPath;
  }

  /** Every directory name directly under `skillsSourceDir`, sorted. */
  async discoverNames(skillsSourceDir: AbsPath): Promise<readonly string[]> {
    if (!(await this.fs.exists(skillsSourceDir))) return [];
    const names = await this.fs.readDir(skillsSourceDir);
    const isDirectoryFlags = await Promise.all(
      names.map((name) =>
        this.fs
          .stat(SkillsService.joinUnderDir(skillsSourceDir, name))
          .then((stat) => stat.isDirectory),
      ),
    );
    const directoryNames = names.filter(
      (_name, index) => isDirectoryFlags[index] === true,
    );
    return directoryNames.toSorted();
  }

  /** Link (or confirm) one skill, returning its manifest entry and a log line. */
  private async installOne(
    sourcePath: AbsPath,
    targetPath: AbsPath,
    previousEntry: SkillManifestEntry | undefined,
  ): Promise<SkillManifestEntry> {
    if (previousEntry !== undefined) {
      // Already ours (per manifest) — only re-create if it was removed by hand.
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

    // Independent per name (own source/target paths, read-only manifest
    // lookup) — `Promise.all` runs them concurrently while `.map` preserves
    // `skillNames`' order in the result, same as
    // `cli/commands/workspace.command.ts`'s `buildWorkspaceLsRow` fan-out.
    const skills = await Promise.all(
      skillNames.map((name) =>
        this.installOne(
          SkillsService.joinUnderDir(skillsSourceDir, name),
          SkillsService.joinUnderDir(skillsTargetDir, name),
          previousByName.get(name),
        ),
      ),
    );
    const actionLines = skillNames.map((name) => `skill ${name}`);
    return { skills, actionLines };
  }
}
