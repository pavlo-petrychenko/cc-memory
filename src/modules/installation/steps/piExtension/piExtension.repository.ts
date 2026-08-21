import type { AppContext } from "@/core/base/context.typedefs.ts";
import { Service } from "@/core/index.ts";
import type { AbsPath } from "@/core/index.ts";
import { expandPath, joinAbs, parentDir } from "@/core/index.ts";
import type { FileSystem } from "@/gateways/index.ts";
import {
  PI_EXTENSION_FILENAME,
  PI_EXTENSIONS_HOME_RELATIVE_PATH,
} from "@/modules/installation/steps/piExtension/piExtension.constants.ts";

/** Copies the built pi bridge into `~/.pi/agent/extensions/cc-memory.js`. A
 * copy, not a symlink: the bundle is build output like `dist/memory.js`, and a
 * stale worktree checkout must never be live inside pi. The remove-before-write
 * mirrors the shim step — writing THROUGH an existing symlink would clobber its
 * target instead of replacing the link. */
export class PiExtensionService extends Service {
  private readonly fs: FileSystem;

  constructor(ctx: AppContext) {
    super(ctx);
    this.fs = ctx.gateways.fs;
  }

  static defaultExtensionsDir(home: AbsPath): AbsPath {
    return expandPath(PI_EXTENSIONS_HOME_RELATIVE_PATH, home);
  }

  static defaultPath(home: AbsPath): AbsPath {
    return joinAbs(PiExtensionService.defaultExtensionsDir(home), PI_EXTENSION_FILENAME);
  }

  async install(distPath: AbsPath, targetPath: AbsPath): Promise<void> {
    const content = await this.fs.readFile(distPath);
    await this.fs.mkdir(parentDir(targetPath));
    await this.fs.remove(targetPath);
    await this.fs.writeFile(targetPath, content);
  }

  async remove(targetPath: AbsPath): Promise<void> {
    await this.fs.remove(targetPath);
  }
}
