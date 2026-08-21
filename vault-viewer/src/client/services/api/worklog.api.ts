import {
  worklogResponseSchema,
  reindexResponseSchema,
} from "@shared/contracts/worklog.contract.js";

import { fetchJson } from "./client.js";

export async function getWorklog(
  workspace: string,
  slug: string,
  signal?: AbortSignal,
): Promise<import("@shared/contracts/worklog.contract.js").WorklogResponseDto> {
  const url = `/api/worklog?workspace=${encodeURIComponent(workspace)}&slug=${encodeURIComponent(slug)}`;
  return fetchJson(url, worklogResponseSchema, { signal });
}

export async function reindex(
  workspace: string,
): Promise<import("@shared/contracts/worklog.contract.js").ReindexResponseDto> {
  const res = await fetch(`/api/reindex?workspace=${encodeURIComponent(workspace)}`, {
    method: "POST",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.message ?? res.statusText);
  const parsed = reindexResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error(`invalid reindex response`);
  return parsed.data;
}
