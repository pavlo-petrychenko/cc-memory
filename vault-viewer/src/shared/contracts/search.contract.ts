import { z } from "zod";

export const searchQuerySchema = z.object({
  workspace: z.string().min(1).optional(),
  q: z.string().default(""),
  type: z.string().optional(),
  tag: z.string().optional(),
  feature: z.string().optional(),
});

export type SearchQueryDto = z.infer<typeof searchQuerySchema>;

export const searchHitSchema = z.object({
  relPath: z.string().min(1),
  title: z.string().min(1),
  type: z.string().min(1),
  importance: z.number().int().nullable(),
  tags: z
    .union([z.array(z.string()), z.string()])
    .transform((v) => (Array.isArray(v) ? v : v.split(/\s+/).filter(Boolean)))
    .pipe(z.array(z.string()))
    .default([]),
  snippet: z.string(),
  score: z.number(),
});

export type SearchHitDto = z.infer<typeof searchHitSchema>;

export const searchResponseSchema = z.object({
  hits: z.array(searchHitSchema),
});

export type SearchResponseDto = z.infer<typeof searchResponseSchema>;
