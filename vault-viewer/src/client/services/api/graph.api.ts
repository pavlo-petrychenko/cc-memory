import { graphResponseSchema } from "@shared/contracts/graph.contract.js";

import { fetchJson } from "./client.js";

export async function getGraph(
  workspace: string,
  focus: string | null,
  depth: number,
  full: boolean,
  signal?: AbortSignal,
): Promise<import("@shared/contracts/graph.contract.js").GraphResponseDto> {
  const p = new URLSearchParams({
    workspace,
    depth: String(depth),
    full: full ? "1" : "0",
  });
  if (focus) p.set("focus", focus);
  return fetchJson(`/api/graph?${p.toString()}`, graphResponseSchema, { signal });
}
