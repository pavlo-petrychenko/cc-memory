import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { ResolvedWorkspace, WorkspaceConfig } from "../types.js";

function expandTilde(p: string): string {
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
  if (p === "~") return homedir();
  return p;
}

export function loadWorkspaces(): ResolvedWorkspace[] {
  const envKb = process.env.CCMEM_KB;
  const envWorklogs = process.env.CCMEM_WORKLOGS;
  const envId = process.env.CCMEM_WORKSPACE_ID || "default";

  if (envKb) {
    return [
      {
        id: envId,
        kb: envKb,
        worklogs: envWorklogs ?? envKb + "/_Worklogs",
        exclude: ["_Worklogs", ".obsidian"],
        indexDb: "",
        match: [],
        kbAbs: expandTilde(envKb),
        worklogsAbs: expandTilde(envWorklogs ?? envKb + "/_Worklogs"),
      },
    ];
  }

  const registryPath = expandTilde("~/.claude/memory/registry.toml");
  if (!existsSync(registryPath)) return [];

  try {
    const raw = readFileSync(registryPath, "utf-8");
    const parsed = parseToml(raw) as { workspace?: WorkspaceConfig[] };
    const list = parsed.workspace ?? [];
    return list.map((w) => ({
      ...w,
      exclude: w.exclude ?? [],
      kbAbs: expandTilde(w.kb),
      worklogsAbs: expandTilde(w.worklogs),
    }));
  } catch (e) {
    console.error("[registry] failed to parse", e);
    return [];
  }
}

export function tildify(abs: string): string {
  const home = homedir();
  if (abs.startsWith(home)) return "~" + abs.slice(home.length);
  return abs;
}
