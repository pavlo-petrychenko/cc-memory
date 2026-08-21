import { reindexResponseSchema } from "@shared/contracts/worklog.contract.js";
import { workspacesResponseSchema } from "@shared/contracts/workspace.contract.js";
import { fetchJson } from "./client.js";

export async function listWorkspaces(signal?: AbortSignal): Promise<import("@shared/contracts/workspace.contract.js").WorkspacesResponseDto> {
  return fetchJson("/api/workspaces", workspacesResponseSchema, { signal });
}

export async function reindex(workspace: string, signal?: AbortSignal): Promise<import("@shared/contracts/worklog.contract.js").ReindexResponseDto> {
  return fetchJson(`/api/reindex?workspace=${encodeURIComponent(workspace)}`, reindexResponseSchema, {
    method: "POST",
    signal,
  });
}
