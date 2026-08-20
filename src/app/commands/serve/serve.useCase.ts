import { AppAdapter } from "@/app/app.adapter.ts";
import { DEFAULT_HOST, DEFAULT_PORT } from "@/app/app.constants.ts";
import { UseCase } from "@/core/index.ts";
import type { AppContext, Result } from "@/core/index.ts";

export type ServeInput = {
  readonly port: number;
  readonly host: string;
  readonly open: boolean;
};

function platformOpenCommand(platform: string): string {
  if (platform === "darwin") return "open";
  if (platform === "win32") return "start";
  return "xdg-open";
}

export class ServeUseCase extends UseCase<ServeInput, Result<readonly string[], string>> {
  async execute(input: ServeInput): Promise<Result<readonly string[], string>> {
    const ctx: AppContext = {
      gateways: this.gateways,
      config: this.config,
      searchIndex: this.searchIndex,
    };
    const app = new AppAdapter(ctx).create();
    const port = input.port;
    const host = input.host;

    const url = `http://${host}:${port}`;

    await new Promise<void>((_resolve, reject) => {
      const server = app.listen(port, host, () => {
        // Log directly — this path blocks, so the normal CLI result printing
        // would never run. Write to stdio now.
        this.gateways.stdio.write(`cc-memory app listening at ${url}\n`);
        if (input.open) {
          const openCommand = platformOpenCommand(process.platform);
          this.gateways.proc
            .run(openCommand, [url], { timeoutMs: 3000 })
            .then(() => this.gateways.stdio.write(`opened ${url}\n`))
            .catch(() =>
              this.gateways.stdio.write(`(could not open browser — visit ${url})\n`),
            );
        }
        // Keep the promise pending — the server holds the event loop.
        // Do not resolve; the CLI should block here.
      });
      // eslint-disable-next-line anti-slop/no-unknown-parameters
      server.on("error", (error: unknown) => {
        reject(error instanceof Error ? error : new Error(String(error)));
      });
      // eslint-disable-next-line anti-slop/no-unknown-parameters
    }).catch((error: unknown) => {
      // eslint-disable-next-line anti-slop/no-runtime-typeof
      const message = error instanceof Error ? error.message : String(error);
      // Propagate as a rejected promise — registerCommands will map to exit 1.
      throw new Error(message);
    });

    // Unreachable — the server blocks forever.
    return { ok: true, value: [] };
  }

  static readonly DEFAULT_PORT = DEFAULT_PORT;
  static readonly DEFAULT_HOST = DEFAULT_HOST;
}
