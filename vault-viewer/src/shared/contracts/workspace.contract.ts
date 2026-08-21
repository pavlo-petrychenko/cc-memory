import { z } from "zod";

export const workspaceDtoSchema = z.object({
  id: z.string().min(1),
  kb: z.string().min(1),
  tildifiedKb: z.string().min(1),
  worklogs: z.string().min(1).optional().default(""),
  exclude: z.array(z.string()).default([]),
  noteCount: z.number().int().min(0),
  indexFresh: z.string().min(1),
  source: z.enum(["registry", "seed-fallback"]).optional().default("seed-fallback"),
});

export type WorkspaceDto = z.infer<typeof workspaceDtoSchema>;

export const workspacesResponseSchema = z.object({
  workspaces: z.array(workspaceDtoSchema),
  source: z.string().min(1),
});

export type WorkspacesResponseDto = z.infer<typeof workspacesResponseSchema>;

export const workspaceQuerySchema = z.object({
  workspace: z.string().min(1).optional(),
});

export type WorkspaceQueryDto = z.infer<typeof workspaceQuerySchema>;
