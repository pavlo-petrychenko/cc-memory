import { ConfigParser } from "@/core/index.ts";
import type { AbsPath, Workspace } from "@/core/index.ts";
import type { AppContext } from "@/core/index.ts";
import { registerCommands, registerHooks, runCli } from "@/core/index.ts";
import { runHookDispatch } from "@/core/index.ts";
import { AppGateways } from "@/gateways/index.ts";
import { SearchIndexAdapter } from "@/gateways/index.ts";
import { TargetResolutionService } from "@/modules/workspace/index.ts";
import { commands, hooks } from "@/registry.wiring.ts";

if (import.meta.main) {
  const env = process.env;
  const gateways = new AppGateways(env);
  const config = new ConfigParser().parse(env);
  const searchIndex = new SearchIndexAdapter(gateways.fs, (path) =>
    gateways.openDatabase(path),
  );
  const ctx: AppContext = { gateways, config, searchIndex };

  const argv = process.argv.slice(2);

  if (argv[0] === "hook") {
    const targetResolution = new TargetResolutionService(ctx);
    const resolveWorkspace = (cwd: AbsPath): Promise<Workspace | null> =>
      targetResolution.resolveWorkspaceOrNull(gateways.env.home(), cwd);
    await runHookDispatch(
      argv[1] ?? "",
      registerHooks(hooks, ctx),
      gateways,
      resolveWorkspace,
    );
  } else {
    const handlers = registerCommands(commands, ctx);
    const result = await runCli(argv, handlers);
    for (const line of result.lines) gateways.stdio.write(line);
    if (result.stderrMessage !== null) {
      process.stderr.write(`${result.stderrMessage}\n`);
    }
    gateways.stdio.exit(result.exitCode);
  }
}
