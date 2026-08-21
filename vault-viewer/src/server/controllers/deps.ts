import type { VaultCache } from "../services/vault.cache.js";
import type { VaultService } from "../services/vault.service.js";
import type { WorkspaceScope } from "../services/workspaceScope.service.js";

/** Everything a controller needs — built once in `app.ts`, passed to every
 * route factory. Controllers never construct services themselves. */
export type ControllerDeps = {
  readonly scope: WorkspaceScope;
  readonly vaultService: VaultService;
  readonly vaultCache: VaultCache;
};
