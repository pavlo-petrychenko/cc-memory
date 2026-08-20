import fs from "fs";
import path from "path";
import os from "os";
import { parse as parseToml } from "smol-toml";

export type Workspace = {
  id: string;
  kb: string;
  worklogs: string;
  exclude: string[];
  indexDb: string;
  match: string[];
};

function expandHome(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  if (p === "~") return os.homedir();
  return p;
}
function tildify(p: string): string {
  const home = os.homedir();
  if (p.startsWith(home)) return "~" + p.slice(home.length);
  return p;
}

function resolveSeedPath(rel: string): string {
  const fileDir = path.dirname(new URL(import.meta.url).pathname);
  // registry.ts is in vault-viewer/server, so ../seed-vault is vault-viewer/seed-vault
  return path.resolve(path.join(fileDir, "../seed-vault", rel));
}
export function loadRegistry(): Workspace[] {
  const fallbackKb = resolveSeedPath("");
  const fallbackWorklogs = resolveSeedPath("_Worklogs");
  const seed: Workspace = { id: "seed", kb: fallbackKb, worklogs: fallbackWorklogs, exclude: ["_Worklogs", ".obsidian"], indexDb: "", match: [] };

  const envKb = process.env.CCMEM_KB;
  const envWorklogs = process.env.CCMEM_WORKLOGS;
  if (envKb) {
    return [{ id: "env", kb: expandHome(envKb), worklogs: envWorklogs ? expandHome(envWorklogs) : fallbackWorklogs, exclude: [], indexDb: "", match: [] }];
  }

  const regPath = path.join(os.homedir(), ".claude/memory/registry.toml");
  try {
    if (!fs.existsSync(regPath)) return [seed];
    const raw = fs.readFileSync(regPath, "utf-8");
    const parsed: any = parseToml(raw);
    const workspaces: Workspace[] = [];
    const list = parsed.workspace ?? [];
    for (const w of list) {
      if (!w.id || !w.kb) continue;
      workspaces.push({
        id: String(w.id),
        kb: expandHome(String(w.kb)),
        worklogs: w.worklogs ? expandHome(String(w.worklogs)) : fallbackWorklogs,
        exclude: Array.isArray(w.exclude) ? w.exclude.map(String) : [],
        indexDb: w.index_db ? expandHome(String(w.index_db)) : "",
        match: Array.isArray(w.match) ? w.match.map(String) : [],
      });
    }
    if (workspaces.length === 0) return [seed];
    // also ensure seed is available as fallback workspace for demo if registry exists but user wants to see demo
    // add seed as additional if not already
    if (!workspaces.find(w => w.id === "seed")) workspaces.push(seed);
    return workspaces;
  } catch (e) {
    console.warn("registry parse failed, using seed", e);
    return [seed];
  }
}

export function tildifyPath(p: string): string { return tildify(p); }
