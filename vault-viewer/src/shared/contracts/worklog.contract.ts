import { z } from "zod";

export const worklogQuerySchema = z.object({
  workspace: z.string().min(1).optional(),
  slug: z.string().min(1).default("_root"),
});

export type WorklogQueryDto = z.infer<typeof worklogQuerySchema>;

export const worklogEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  body: z.string(),
  relPath: z.string().min(1),
});

export type WorklogEntryDto = z.infer<typeof worklogEntrySchema>;

export const worklogResponseSchema = z.object({
  slug: z.string().min(1),
  stateExists: z.boolean(),
  stateBody: z.string().optional(),
  entries: z.array(worklogEntrySchema),
});

export type WorklogResponseDto = z.infer<typeof worklogResponseSchema>;

export const worklogListResponseSchema = z.array(worklogResponseSchema);

export const reindexBodySchema = z.object({
  workspace: z.string().min(1).optional(),
});

export const reindexQuerySchema = z.object({
  workspace: z.string().min(1).optional(),
});

export const reindexResponseSchema = z.object({
  total: z.number().int().min(0),
  added: z.number().int().min(0),
  updated: z.number().int().min(0),
  removed: z.number().int().min(0),
});

export type ReindexResponseDto = z.infer<typeof reindexResponseSchema>;
