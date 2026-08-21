import { z } from "zod";

export const searchQuerySchema = z.object({
  workspace: z.string().min(1).optional(),
  q: z.string().optional().default(""),
  type: z.string().optional(),
  tag: z.string().optional(),
  feature: z.string().optional(),
});

export type SearchQueryDto = z.infer<typeof searchQuerySchema>;
