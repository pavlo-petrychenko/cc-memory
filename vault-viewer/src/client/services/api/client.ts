import { z } from "zod";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(
  input: RequestInfo,
  schema: z.ZodSchema<unknown>,
  init?: RequestInit,
): Promise<T> {
  const anySchema = schema as z.ZodSchema<T>;
  const res = await fetch(input, init);
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = (json as { message?: string })?.message ?? res.statusText;
    const code = (json as { code?: string })?.code ?? "UNKNOWN";
    const details = (json as { errors?: unknown })?.errors;
    throw new ApiError(msg, res.status, code, details);
  }

  const parsed = (anySchema as z.ZodSchema<T>).safeParse(json);
  if (!parsed.success) {
    throw new ApiError(`invalid response shape: ${parsed.error.message}`, res.status, "INVALID_RESPONSE");
  }
  return parsed.data as T;
}

export function fileUrl(workspace: string, path: string): string {
  return `/api/file?workspace=${encodeURIComponent(workspace)}&path=${encodeURIComponent(path)}`;
}
