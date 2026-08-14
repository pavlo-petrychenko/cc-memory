import type { AbsPath } from "../core/AbsPath.ts";
import { expandPath } from "../core/paths.ts";
import type { FileSystem } from "../platform/fileSystem.port.ts";
import {
  PRE_CCMEMORY_BACKUP_SUFFIX,
  type SkillManifestEntry,
} from "./manifest.service.ts";

/**
 * Symlink every skill under `<repo>/src/skills` into `~/.claude/skills`,
 * backing up a pre-existing REAL directory to `<name>.pre-ccmemory.bak` once.
 *
 * The `FileSystem` port has no `readlink`/`lstat` (see `fileSystem.port.ts`
 * — it is frozen), so there is no portable way to ask "is `linkPath` already
 * a symlink pointing at `sourcePath`?". Idempotency is decided from the
 * MANIFEST instead: a skill already recorded from a previous install run is
 * trusted to be ours and left alone (re-created only if it has since
 * vanished); a skill with no prior record gets the back-up-if-real-directory
 * treatment before its first link.
 */

const SKILLS_TARGET_HOME_RELATIVE_PATH = "~/.claude/skills";

export function defaultSkillsTargetDir(home: AbsPath): AbsPath {
  return expandPath(SKILLS_TARGET_HOME_RELATIVE_PATH, home);
}

/** Join a name `readDir` returned onto an already-validated `AbsPath`
 * directory — same reasoning as `index/build.ts`'s `joinUnderDir`. */
function joinUnderDir(dir: AbsPath, name: string): AbsPath {
  // SAFETY: `dir` is an already-absolute, normalized `AbsPath`; `name` is one
  // entry `FileSystem.readDir` returned for it, so the join is another
  // absolute, normalized path directly under `dir`.
  return `${dir}/${name}` as AbsPath;
}

function backupPathFor(targetPath: AbsPath): AbsPath {
  // SAFETY: appending a fixed literal suffix to an absolute, normalized path
  // introduces no `~`, `.` or `..` segment.
  return `${targetPath}${PRE_CCMEMORY_BACKUP_SUFFIX}` as AbsPath;
}

/** Every directory name directly under `skillsSourceDir`, sorted. */
export async function discoverSkillNames(
  fs: FileSystem,
  skillsSourceDir: AbsPath,
): Promise<readonly string[]> {
  if (!(await fs.exists(skillsSourceDir))) return [];
  const names = await fs.readDir(skillsSourceDir);
  const isDirectoryFlags = await Promise.all(
    names.map((name) =>
      fs.stat(joinUnderDir(skillsSourceDir, name)).then((stat) => stat.isDirectory),
    ),
  );
  const directoryNames = names.filter((_name, index) => isDirectoryFlags[index] === true);
  return directoryNames.toSorted();
}

export type SkillInstallOutcome = {
  readonly skills: readonly SkillManifestEntry[];
  /** One `skill <name>` log line per skill. */
  readonly actionLines: readonly string[];
};

/** Link (or confirm) one skill, returning its manifest entry and a log line. */
async function installOneSkill(
  fs: FileSystem,
  sourcePath: AbsPath,
  targetPath: AbsPath,
  previousEntry: SkillManifestEntry | undefined,
): Promise<SkillManifestEntry> {
  if (previousEntry !== undefined) {
    // Already ours (per manifest) — only re-create if it was removed by hand.
    if (!(await fs.exists(targetPath))) {
      await fs.symlink(sourcePath, targetPath);
    }
    return previousEntry;
  }

  let backedUp = false;
  if (await fs.exists(targetPath)) {
    const backupPath = backupPathFor(targetPath);
    if (!(await fs.exists(backupPath))) {
      await fs.rename(targetPath, backupPath);
    } else {
      await fs.remove(targetPath);
    }
    backedUp = true;
  }
  await fs.symlink(sourcePath, targetPath);
  return { name: targetPath.slice(targetPath.lastIndexOf("/") + 1), backedUp };
}

export async function installSkills(
  fs: FileSystem,
  skillsSourceDir: AbsPath,
  skillsTargetDir: AbsPath,
  skillNames: readonly string[],
  previousSkills: readonly SkillManifestEntry[],
): Promise<SkillInstallOutcome> {
  await fs.mkdir(skillsTargetDir);
  const previousByName = new Map(previousSkills.map((entry) => [entry.name, entry]));

  // Independent per name (own source/target paths, read-only manifest
  // lookup) — `Promise.all` runs them concurrently while `.map` preserves
  // `skillNames`' order in the result, same as `cli/commands/workspace.command.ts`'s
  // `buildWorkspaceLsRow` fan-out.
  const skills = await Promise.all(
    skillNames.map((name) =>
      installOneSkill(
        fs,
        joinUnderDir(skillsSourceDir, name),
        joinUnderDir(skillsTargetDir, name),
        previousByName.get(name),
      ),
    ),
  );
  const actionLines = skillNames.map((name) => `skill ${name}`);
  return { skills, actionLines };
}
