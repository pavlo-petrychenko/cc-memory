export { resolve } from "@/workspace/commands/resolve/index.ts";
export {
  workspaceAdd,
  workspaceLs,
  workspaceRm,
} from "@/workspace/commands/workspace/index.ts";
export {
  defaultRegistryPath,
  expandWorkspace,
  findWorkspace,
  loadRegistry,
  saveRegistry,
  validateNew,
} from "@/workspace/services/registry/index.ts";
export { resolveWorkspace, worktreeSlug } from "@/workspace/services/resolver/index.ts";
export type { RegistryConflict, RegistryError } from "@/workspace/workspace.typedefs.ts";
export {
  RegistryConflictKind,
  RegistryErrorKind,
} from "@/workspace/workspace.typedefs.ts";
export {
  loadRegistryForCli,
  NO_WORKSPACE_FOR_CWD_MESSAGE,
  noSuchWorkspaceMessage,
  resolveTargetWorkspaces,
  resolveWorkspaceForCwd,
} from "@/workspace/targetResolution/index.ts";
