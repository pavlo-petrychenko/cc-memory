import { z } from "zod";

export const worklogQuerySchema = z.object({
  workspace: z.string().min(1).optional(),
  slug: z.string().min(1).default("_root"),
});

export type WorklogQueryDto = z.infer<typeof worklogQuerySchema>;

export const reindexQuerySchema = z.object({
  workspace: z.string().min(1).optional(),
});

export const reindexBodySchema = z.object({
  workspace: z.string().min(1).optional(),
});

export type ReindexQueryDto = z.infer<typeof reindexQuerySchema>;
