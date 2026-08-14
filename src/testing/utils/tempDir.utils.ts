import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type TempDir = {
  readonly path: string;
  readonly remove: () => void;
};

/**
 * Create a fresh temp directory under the OS temp root, prefixed for easy
 * identification.
 *
 * The path is resolved to its real location: on macOS the OS temp root
 * (`/var/folders/...`) is itself a symlink into `/private`, and a spawned process's
 * `os.getcwd()` reports the resolved form — so an unresolved path used as a registry
 * `match` prefix or as a sandboxed `$HOME` silently fails to match anything.
 */
export function createTempDir(prefix: string): TempDir {
  const path = realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
  return { path, remove: () => rmSync(path, { recursive: true, force: true }) };
}
