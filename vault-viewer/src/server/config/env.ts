import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  API_PORT: z.coerce.number().int().min(1024).max(65535).default(3416),
  CCMEM_REGISTRY: z.string().trim().min(1).optional(),
  CORS_ORIGINS: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : ["http://localhost:3415"])),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  UI_PORT: z.coerce.number().int().min(1024).max(65535).default(3415),
});

export type Config = z.infer<typeof envSchema> & { port: number; allowedOrigins: string[] };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.parse(env);
  return {
    ...parsed,
    port: parsed.API_PORT,
    allowedOrigins: parsed.CORS_ORIGINS as unknown as string[],
  };
}
