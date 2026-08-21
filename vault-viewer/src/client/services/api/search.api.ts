import { searchResponseSchema } from "@shared/contracts/search.contract.js";
import { fetchJson } from "./client.js";

export async function search(
  workspace: string,
  q: string,
  filters: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<import("@shared/contracts/search.contract.js").SearchResponseDto> {
  const p = new URLSearchParams({ workspace, q, ...filters });
  return fetchJson(`/api/search?${p.toString()}`, searchResponseSchema, { signal });
}
