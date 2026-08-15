import { homedir } from "node:os";

import type { AbsPath } from "@/core/index.ts";
import { absPath, parentDir } from "@/core/index.ts";
import type { Env } from "@/gateways/env/env.typedefs.ts";

/** The real `Env`, reading the actual process for the home directory and cwd. */
export class EnvAdapter implements Env {
  get(name: string): string | undefined {
    return process.env[name];
  }

  home(): AbsPath {
    return absPath(homedir());
  }

  cwd(): AbsPath {
    return absPath(process.cwd());
  }

  repoRoot(): AbsPath {
    const runningFilePath = absPath(new URL(import.meta.url).pathname);
    // `dist/memory.js` sits two path segments below the repo root; `import.meta.url`
    // resolves to the bundle's own URL at runtime, so its parent's parent is the root.
    return parentDir(parentDir(runningFilePath));
  }
}
