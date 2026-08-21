import { z } from "zod";

export const workspaceIdSchema = z.string().min(1);

export const relPathSchema = z
  .string()
  .min(1)
  .refine((v) => !v.includes("\0"), "null byte not allowed")
  .refine((v) => !/%252e/i.test(v), "double-encoded not allowed")
  .refine((v) => !/%2e/i.test(v), "encoded dot not allowed")
  .refine(
    (v) => {
      try {
        const d = decodeURIComponent(v);
        return (
          !d.includes("..") &&
          !d.startsWith("/") &&
          !d.includes("//") &&
          !d.includes("\\")
        );
      } catch {
        return false;
      }
    },
    { message: "invalid path" },
  );

export const workspaceQuerySchema = z.object({
  workspace: z.string().min(1).optional(),
});

export const pathQuerySchema = z.object({
  workspace: z.string().min(1).optional(),
  path: relPathSchema,
});
