import { SERVE_DESCRIPTOR } from "@/app/commands/serve/serve.constants.ts";
import { ServeUseCase } from "@/app/commands/serve/serve.useCase.ts";
import { Command } from "@/core/index.ts";
import { flagValue, hasFlag } from "@/core/index.ts";
import type { ArgsError, Result } from "@/core/index.ts";

export function parseServeOptions(
  tokens: readonly string[],
): Result<ServeInput, ArgsError> {
  const rawPort = flagValue(tokens, "--port");
  const rawHost = flagValue(tokens, "--host");
  const open = hasFlag(tokens, "--open");

  let port = ServeUseCase.DEFAULT_PORT;
  if (rawPort !== null) {
    const parsed = Number.parseInt(rawPort, 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
      return { ok: false, error: { message: `serve: invalid --port ${rawPort}` } };
    }
    port = parsed;
  }

  const host = rawHost ?? ServeUseCase.DEFAULT_HOST;
  if (host.trim() === "") {
    return { ok: false, error: { message: "serve: --host must not be empty" } };
  }

  return { ok: true, value: { port, host, open } };
}

@Command({
  path: SERVE_DESCRIPTOR.path,
  usage: SERVE_DESCRIPTOR.usage,
  summary: SERVE_DESCRIPTOR.summary,
  hidden: SERVE_DESCRIPTOR.hidden,
  Handler: ServeUseCase,
  mapOptions: (tokens): Result<ServeInput, ArgsError> => parseServeOptions(tokens),
})
export class ServeCommand {}

type ServeInput = Parameters<ServeUseCase["execute"]>[0];
