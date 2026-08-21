import { z } from "zod";

export const relationTypeSchema = z.enum([
  "links_to",
  "relates_to",
  "depends_on",
  "implements",
  "extends",
  "uses",
  "references",
  "blocks",
  "blocked_by",
  "part_of",
  "contains",
]);

export type RelationType = z.infer<typeof relationTypeSchema>;

// fallback: keep string for custom types but validate known ones separately
export const relationTypeStringSchema = z.string().min(1).regex(/^[a-z_]+$/);

export const relSchema = z.object({
  relationType: z.string().min(1),
  target: z.string().min(1),
});

export type RelDto = z.infer<typeof relSchema>;
