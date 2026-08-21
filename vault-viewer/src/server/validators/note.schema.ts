import { z } from "zod";

import { relPathSchema } from "./common.schema.js";

export const noteQuerySchema = z.object({
  workspace: z.string().min(1).optional(),
  path: relPathSchema,
});

export const fileQuerySchema = z.object({
  workspace: z.string().min(1).optional(),
  path: relPathSchema,
});

export type NoteQueryDto = z.infer<typeof noteQuerySchema>;
export type FileQueryDto = z.infer<typeof fileQuerySchema>;
