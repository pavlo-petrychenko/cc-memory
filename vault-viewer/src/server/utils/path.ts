import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

export function expandTilde(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  if (p === "~") return homedir();
  return p;
}

export function tildify(p: string): string {
  const home = homedir();
  if (p === home) return "~";
  if (p.startsWith(home + "/")) return "~" + p.slice(home.length);
  return p;
}

/**
 * Reject unsafe relPath before any FS access.
 * Catches: decoded "..", absolute, "//", null byte, %2e / %252e double-encoded.
 */
export function isSafeRelPath(raw: string): boolean {
  if (!raw || raw.includes("\0")) return false;
  // reject double-encoded %252e before decode
  if (/%252e/i.test(raw)) return false;
  // reject encoded dots
  if (/%2e/i.test(raw)) return false;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return false;
  }

  if (decoded.includes("..")) return false;
  if (decoded.startsWith("/")) return false;
  if (decoded.includes("//")) return false;
  if (decoded.includes("\\")) return false;
  return true;
}

/**
 * Assert absolute target is inside root. Throws ForbiddenError if outside.
 * Uses trailing sep to avoid prefix bypass: /vault vs /vault-evil.
 */
export function assertInside(root: string, targetAbs: string): void {
  const rootResolved = resolve(root);
  const targetResolved = resolve(targetAbs);
  if (targetResolved === rootResolved) return;
  if (!targetResolved.startsWith(rootResolved + sep)) {
    const err = new Error("outside vault") as Error & { code: string };
    err.code = "FORBIDDEN";
    throw err;
  }
}
