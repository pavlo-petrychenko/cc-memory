import { treeResponseSchema } from "@shared/contracts/tree.contract.js";
import { fetchJson } from "./client.js";

export async function getTree(
  workspace: string,
  signal?: AbortSignal,
): Promise<import("@shared/contracts/tree.contract.js").TreeResponseDto> {
  const url = `/api/tree?workspace=${encodeURIComponent(workspace)}`;
  return fetchJson(url, treeResponseSchema, { signal });
}
