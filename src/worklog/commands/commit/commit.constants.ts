import type { CommandDescriptor } from "@/core/index.ts";

export const DEFAULT_COMMIT_MESSAGE = "memory snapshot";

export const COMMIT_DESCRIPTOR: CommandDescriptor = {
  path: ["commit"],
  usage: ["commit [workspace] [-m MSG]"],
  summary: "MANUAL git snapshot of a KB (local; no push)",
  hidden: false,
};

export const GIT_TIMEOUT_MS = 10_000;
