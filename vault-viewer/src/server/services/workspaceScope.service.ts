import { loadWorkspaces } from "../../../server/registry.js";
import { NotFoundError } from "../errors/appError.js";
import type { VaultCache } from "./vault.cache.js";

type LoadedWorkspaces = Awaited<ReturnType<typeof loadWorkspaces>>;
export type WorkspaceEntry = LoadedWorkspaces["workspaces"][number];

/** Owns the workspace registry snapshot: cached loads, cache busting, and the
 * one workspace-resolution rule every route shares. An explicit unknown id is a
 * 404; an absent id falls back to the first workspace (documented default the
 * client relies on for first paint). */
export class WorkspaceScope {
  private cache: LoadedWorkspaces | null = null;

  constructor(private readonly vaultCache: VaultCache) {}

  async list(): Promise<LoadedWorkspaces> {
    if (!this.cache) {
      this.cache = await loadWorkspaces();
    }
    return this.cache;
  }

  /** Resolves the query's workspace, or `null` when the registry is empty. */
  async resolve(wid: string | undefined): Promise<WorkspaceEntry | null> {
    const { workspaces } = await this.list();
    if (!wid) {
      return workspaces[0] ?? null;
    }
    const found = workspaces.find((w) => w.id === wid);
    if (!found) {
      throw new NotFoundError(`workspace ${wid}`);
    }
    return found;
  }

  bust(): void {
    this.cache = null;
    this.vaultCache.bustAll();
  }
}
