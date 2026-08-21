import { z } from "zod";

export const treeQuerySchema = z.object({
  workspace: z.string().min(1).optional(),
});

export type TreeQueryDto = z.infer<typeof treeQuerySchema>;
