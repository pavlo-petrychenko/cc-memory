import type { CliCommand } from "@/core/index.ts";

export type HookArgs = { readonly command: CliCommand.Hook; readonly name: string };
