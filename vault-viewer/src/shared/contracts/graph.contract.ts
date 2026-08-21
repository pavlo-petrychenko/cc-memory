import { z } from "zod";

export const graphQuerySchema = z.object({
  workspace: z.string().min(1).optional(),
  focus: z.string().optional(),
  depth: z.coerce.number().int().min(1).max(2).default(1),
  full: z
    .union([z.string(), z.boolean(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined) return false;
      if (typeof v === "boolean") return v;
      if (typeof v === "number") return v === 1;
      return v === "1" || v === "true";
    })
    .pipe(z.boolean()),
  type: z.string().optional(),
  tag: z.string().optional(),
  feature: z.string().optional(),
});

export type GraphQueryDto = z.infer<typeof graphQuerySchema>;

export const graphNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.string().min(1),
  importance: z.number().int().nullable(),
  tags: z
    .union([z.array(z.string()), z.string()])
    .transform((v) => (Array.isArray(v) ? v : v.split(/\s+/).filter(Boolean)))
    .pipe(z.array(z.string()))
    .default([]),
});

export type GraphNodeDto = z.infer<typeof graphNodeSchema>;

export const graphEdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  relationType: z.string().min(1),
});

export type GraphEdgeDto = z.infer<typeof graphEdgeSchema>;

export const graphResponseSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
});

export type GraphResponseDto = z.infer<typeof graphResponseSchema>;
