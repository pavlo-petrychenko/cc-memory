import { workspacesResponseSchema } from "@shared/contracts/workspace.contract.js";
import { fetchJson } from "./client.js";

export async function listWorkspaces(signal?: AbortSignal): Promise<import("@shared/contracts/workspace.contract.js").WorkspacesResponseDto> {
  return fetchJson("/api/workspaces", workspacesResponseSchema, { signal });
}
