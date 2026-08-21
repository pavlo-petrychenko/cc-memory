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
    .pipe(z.boolean())
    .default(false),
  type: z.string().optional(),
  tag: z.string().optional(),
  feature: z.string().optional(),
});

export type GraphQueryDto = z.infer<typeof graphQuerySchema>;
