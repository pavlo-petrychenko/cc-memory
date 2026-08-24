import { z } from "zod";

export const treeNodeSchema: z.ZodType<{
  name: string;
  path: string;
  type: "dir" | "file";
  children?: {
    name: string;
    path: string;
    type: "dir" | "file";
    children?: unknown;
    isIndex?: boolean;
  }[];
  isIndex?: boolean;
}> = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["dir", "file"]),
  children: z.array(z.lazy(() => treeNodeSchema)).optional(),
  isIndex: z.boolean().optional(),
});

export type TreeNodeDto = z.infer<typeof treeNodeSchema>;

export const noteMetaSchema = z.object({
  relPath: z.string().min(1),
  title: z.string().min(1),
  type: z.string().min(1),
  importance: z.number().int().nullable(),
  tags: z
    .union([z.array(z.string()), z.string()])
    .transform((v) => (Array.isArray(v) ? v : v.split(/\s+/).filter(Boolean)))
    .pipe(z.array(z.string()))
    .default([]),
  epic: z.string().optional().default(""),
});

export type NoteMetaDto = z.infer<typeof noteMetaSchema>;

export const worklogSlugSchema = z.object({
  slug: z.string().min(1),
  stateExists: z.boolean(),
  stateBody: z.string().optional(),
  entries: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      body: z.string(),
      relPath: z.string().min(1),
    }),
  ),
});

/** One scanned worklog tree as returned inside `/api/tree`. */
export type WorklogSlugDto = z.infer<typeof worklogSlugSchema>;

export const treeQuerySchema = z.object({
  workspace: z.string().min(1).optional(),
});

export const treeResponseSchema = z.object({
  kbTree: treeNodeSchema,
  worklogs: z.array(worklogSlugSchema),
  notes: z.array(noteMetaSchema),
});

export type TreeResponseDto = z.infer<typeof treeResponseSchema>;
