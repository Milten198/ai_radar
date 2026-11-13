import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** Repo-root .env (pipeline/src/config.ts → ../../.env). */
export const ROOT_ENV_PATH = fileURLToPath(new URL("../../.env", import.meta.url));

const ConfigSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1, "missing: set it as a system env var or in .env"),
  OPENROUTER_MODEL_SUMMARY: z.string().min(1),
  OPENROUTER_MODEL_BRIEF: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  FETCH_WINDOW_HOURS: z.coerce.number().int().positive().default(48),
  MAX_ARTICLE_CHARS: z.coerce.number().int().positive().default(12000),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Pure: validate an env-like object. Throws a readable error listing every problem. */
export function parseConfig(env: Record<string, string | undefined>): Config {
  // Treat empty strings as unset so defaults and "missing" messages apply.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const result = ConfigSchema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join("\n")}`);
  }
  return result.data;
}

let cached: Config | undefined;

/** Load repo-root .env (existing process env vars win) and validate. */
export function loadConfig(): Config {
  if (cached) return cached;
  if (existsSync(ROOT_ENV_PATH)) process.loadEnvFile(ROOT_ENV_PATH);
  cached = parseConfig(process.env);
  return cached;
}
