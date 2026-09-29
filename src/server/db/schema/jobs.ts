import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { jobStatusEnum, jobTypeEnum } from "./enums";

/**
 * Transactional outbox for side effects (LLM summary, email, Notion).
 * Why: external APIs fail/rate-limit (Notion ≈ 3 req/s). Persisting the intent
 * first and processing it with retries makes delivery reliable and idempotent.
 */
export const integrationJobs = pgTable(
  "integration_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: jobTypeEnum("type").notNull(),
    status: jobStatusEnum("status").notNull().default("pending"),
    /** e.g. { sessionId } */
    payload: jsonb("payload").$type<{ sessionId: string }>().notNull(),
    /** Guarantees one job per (type, session): `${type}:${sessionId}` */
    idempotencyKey: text("idempotency_key").notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("integration_jobs_idempotency_idx").on(t.idempotencyKey),
    index("integration_jobs_pick_idx").on(t.status, t.runAfter),
  ],
);
