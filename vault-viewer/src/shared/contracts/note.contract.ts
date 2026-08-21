import { z } from "zod";
import { relSchema } from "./rel.contract.js";

export const backlinkSchema = z.object({
  relPath: z.string().min(1),
  title: z.string().min(1),
  snippet: z.string(),
});

export type BacklinkDto = z.infer<typeof backlinkSchema>;

export const noteQuerySchema = z.object({
  workspace: z.string().min(1).optional(),
  path: z.string().min(1),
});

export const noteSchema = z.object({
  relPath: z.string().min(1),
  title: z.string().min(1),
  type: z.string().min(1),
  importance: z.number().int().nullable(),
  tags: z.array(z.string()).default([]),
  epic: z.string().optional().default(""),
  body: z.string(),
  rels: z.array(relSchema).default([]),
  backlinks: z.array(backlinkSchema).default([]),
  outgoing: z.array(relSchema).default([]),
  isWorklog: z.boolean().default(false),
});

export type NoteDto = z.infer<typeof noteSchema>;

export const fileQuerySchema = z.object({
  workspace: z.string().min(1).optional(),
  path: z.string().min(1),
});

export const errorEnvelopeSchema = z.object({
  status: z.enum(["error"]),
  code: z.string().min(1),
  message: z.string().min(1),
  errors: z.unknown().optional(),
  requestId: z.string().optional(),
});

export type ErrorEnvelopeDto = z.infer<typeof errorEnvelopeSchema>;
