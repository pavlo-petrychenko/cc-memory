import type { CliCommand } from "@/cli/args/args.typedefs.ts";

export type HookArgs = { readonly command: CliCommand.Hook; readonly name: string };
