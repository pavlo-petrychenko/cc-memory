import { runCli as dispatchCli } from "@/cli/cli.runner.ts";
import { wireCli } from "@/cli/cli.wiring.ts";
import type { Config } from "@/core/index.ts";
import { ConfigParser } from "@/core/index.ts";
import type { CliOutcome } from "@/core/index.ts";
import { AppGateways } from "@/gateways/index.ts";
import type { Gateways } from "@/gateways/index.ts";

/** The testable entry: wire everything, run argv, write stdout lines, and return
 * the outcome (stderr + exit code) for `main`'s guard to finish. */
export async function runCli(
  argv: readonly string[],
  container: Gateways,
  config: Config,
): Promise<CliOutcome> {
  const { commands } = wireCli(container);
  const context = {
    home: container.env.home(),
    cwd: container.env.cwd(),
    config,
  };
  const result = await dispatchCli(argv, commands, context);
  for (const line of result.lines) container.stdio.write(line);
  return { exitCode: result.exitCode, stderrMessage: result.stderrMessage };
}

if (import.meta.main) {
  const envSnapshot = process.env;
  const container = new AppGateways(envSnapshot);
  const config = new ConfigParser().parse(envSnapshot);
  const outcome = await runCli(process.argv.slice(2), container, config);
  if (outcome.stderrMessage !== null) {
    process.stderr.write(`${outcome.stderrMessage}\n`);
  }
  container.stdio.exit(outcome.exitCode);
}
