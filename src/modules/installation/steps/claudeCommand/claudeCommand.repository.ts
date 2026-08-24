import type { AppContext } from "@/core/base/context.typedefs.ts";
import { Service, absPath, expandPath, joinAbs, parentDir } from "@/core/index.ts";
import type { AbsPath } from "@/core/index.ts";
import type { FileSystem } from "@/gateways/index.ts";
import {
  CCMEMORY_COMMAND_FILENAME,
  COMMANDS_TARGET_HOME_RELATIVE_PATH,
} from "@/modules/installation/steps/claudeCommand/claudeCommand.constants.ts";
import { PRE_CCMEMORY_BACKUP_SUFFIX } from "@/modules/installation/steps/manifest/manifest.constants.ts";

/** Installs `/ccmemory` as a Claude Code user slash command: symlinks
 * `<repo>/src/commands/ccmemory.md` into `~/.claude/commands`, backing up a
 * pre-existing REAL file once. A symlink (like the skills step) so the live
 * command always reflects the repo content. */
export class ClaudeCommandService extends Service {
  private readonly fs: FileSystem;

  constructor(ctx: AppContext) {
    super(ctx);
    this.fs = ctx.gateways.fs;
  }

  static defaultCommandsDir(home: AbsPath): AbsPath {
    return expandPath(COMMANDS_TARGET_HOME_RELATIVE_PATH, home);
  }

  static defaultTargetPath(home: AbsPath): AbsPath {
    return joinAbs(
      ClaudeCommandService.defaultCommandsDir(home),
      CCMEMORY_COMMAND_FILENAME,
    );
  }

  async install(sourcePath: AbsPath, targetPath: AbsPath): Promise<boolean> {
    await this.fs.mkdir(parentDir(targetPath));
    let backedUp = false;
    if (await this.fs.exists(targetPath)) {
      const backupPath = absPath(`${targetPath}${PRE_CCMEMORY_BACKUP_SUFFIX}`);
      if (!(await this.fs.exists(backupPath))) {
        await this.fs.rename(targetPath, backupPath);
        backedUp = true;
      } else {
        await this.fs.remove(targetPath);
      }
    }
    await this.fs.symlink(sourcePath, targetPath);
    return backedUp;
  }

  /** Removes the link and restores a pre-cc-memory backup if one exists. */
  async uninstall(targetPath: AbsPath): Promise<void> {
    await this.fs.remove(targetPath);
    const backupPath = absPath(`${targetPath}${PRE_CCMEMORY_BACKUP_SUFFIX}`);
    if (await this.fs.exists(backupPath)) {
      await this.fs.rename(backupPath, targetPath);
    }
  }
}
