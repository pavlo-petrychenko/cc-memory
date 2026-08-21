import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { parse as parseToml } from "smol-toml";

export type RawWorkspace = {
  id: string;
  match: string[];
  kb: string;
  worklogs: string;
  exclude: string[];
  index_db: string;
};

export type Workspace = {
  id: string;
  kb: string; // expanded abs
  worklogs: string;
  exclude: string[];
  indexDb: string;
  match: string[];
  tildifiedKb: string;
};

function expandTilde(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  if (p === "~") return homedir();
  return p;
}
function tildify(p: string): string {
  const home = homedir();
  if (p === home) return "~";
  if (p.startsWith(home + "/")) return "~" + p.slice(home.length);
  return p;
}

export async function loadWorkspaces(): Promise<{
  workspaces: Workspace[];
  source: string;
}> {
  const candidates = [
    process.env.CCMEM_REGISTRY ? expandTilde(process.env.CCMEM_REGISTRY) : null,
    join(homedir(), ".claude/memory/registry.toml"),
  ].filter(Boolean) as string[];

  for (const cand of candidates) {
    try {
      await stat(cand);
      const text = await readFile(cand, "utf8");
      const parsed = parseToml(text) as { workspace?: RawWorkspace[] };
      const raws = parsed.workspace ?? [];
      const workspaces: Workspace[] = raws.map((r) => ({
        id: r.id,
        kb: resolve(expandTilde(r.kb)),
        worklogs: resolve(expandTilde(r.worklogs)),
        exclude: r.exclude ?? [],
        indexDb: resolve(expandTilde(r.index_db ?? "")),
        match: (r.match ?? []).map(expandTilde),
        tildifiedKb: tildify(resolve(expandTilde(r.kb))),
      }));
      if (workspaces.length > 0) return { workspaces, source: cand };
    } catch {}
  }
  // fallback to seed vault
  const seedKb = resolve(join(process.cwd(), "seed-vault"));
  const seedWorklogs = resolve(join(process.cwd(), "seed-vault/_Worklogs"));
  return {
    workspaces: [
      {
        id: "seed",
        kb: seedKb,
        worklogs: seedWorklogs,
        exclude: [],
        indexDb: "",
        match: [],
        tildifiedKb: tildify(seedKb),
      },
    ],
    source: "seed-fallback",
  };
}
