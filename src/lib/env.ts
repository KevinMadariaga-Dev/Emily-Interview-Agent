import "server-only";
import { z } from "zod";

/**
 * Centralized, validated server environment.
 * - Validated lazily (on first access) so `next build` works without secrets.
 * - Integration keys are optional: each adapter checks its own key and fails
 *   with a clear error when it is actually used without configuration.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  // Optional: the landing (Emily setup, interviews, email/Notion) runs without a database.
  DATABASE_URL: z.string().optional(), // "" = not configured (requireEnv rejects it)
  // Optional password for the whole site (HTTP Basic) — see src/proxy.ts.
  SITE_PASSWORD: z.string().optional(), // "" = no password

  ADMIN_SESSION_SECRET: z.string().min(16).optional(),
  ADMIN_ALLOWED_EMAILS: z.string().default(""),

  VOICE_PROVIDER: z.enum(["deepgram", "openai-realtime"]).default("deepgram"),
  DEEPGRAM_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_STT_MODEL: z.string().default("gpt-4o-transcribe"),
  OPENAI_TTS_MODEL: z.string().default("gpt-4o-mini-tts"),
  OPENAI_TTS_VOICE: z.string().default("coral"),

  LLM_PROVIDER: z.enum(["openai", "anthropic"]).default("openai"),
  LLM_MODEL: z.string().default("gpt-5.6-luna"),
  // Only for reasoning models (gpt-5.x, o-series): "low" keeps voice turns at ≈2–3 s.
  LLM_REASONING_EFFORT: z.enum(["none", "minimal", "low", "medium", "high"]).default("low"),
  ANTHROPIC_API_KEY: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Emily <onboarding@resend.dev>"),
  EMAIL_REPORT_TO: z.string().default(""),
  // Gmail SMTP (App Password). When set, reports are sent from this Gmail account.
  GMAIL_USER: z.string().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  GMAIL_FROM_NAME: z.string().default("Emily · NEOera"),
  // Optional comma list of emails or @domains allowed to receive interview reports.
  REPORT_EMAIL_ALLOWLIST: z.string().default(""),

  NOTION_API_KEY: z.string().optional(),
  NOTION_DATA_SOURCE_ID: z.string().optional(),
  NOTION_API_VERSION: z.string().default("2025-09-03"),

  CRON_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("❌ Invalid environment variables", z.treeifyError(parsed.error));
    throw new Error("Invalid environment variables — check .env.local against .env.example");
  }
  cached = parsed.data;
  return cached;
}

/** Throws a descriptive error when a required integration secret is missing. */
export function requireEnv<K extends keyof ServerEnv>(key: K): NonNullable<ServerEnv[K]> {
  const value = env()[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required env var: ${String(key)}`);
  }
  return value as NonNullable<ServerEnv[K]>;
}
