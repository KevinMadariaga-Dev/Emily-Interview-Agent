import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { admins } from "./admins";
import { localeEnum, sessionStatusEnum, turnRoleEnum } from "./enums";

/**
 * Interview template = the configurable "brief" Emily follows:
 * objective, persona/tone, question guide and guardrails to keep the
 * participant focused on the interview goal.
 */
export const interviewTemplates = pgTable("interview_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  objective: text("objective").notNull(),
  /** Ordered question guide: [{ id, text, followUps?: string[] }] */
  questions: jsonb("questions").$type<TemplateQuestion[]>().notNull().default([]),
  /** Extra system-prompt instructions (tone, guardrails, topics to avoid). */
  instructions: text("instructions"),
  defaultLocale: localeEnum("default_locale").notNull().default("es"),
  maxDurationMinutes: integer("max_duration_minutes").notNull().default(20),
  isActive: boolean("is_active").notNull().default(true),
  createdById: uuid("created_by_id").references(() => admins.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TemplateQuestion = { id: string; text: string; followUps?: string[] };

/** Shareable link: /i/<token>. One template can have many links (per campaign/participant). */
export const interviewLinks = pgTable(
  "interview_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => interviewTemplates.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    label: text("label"),
    /** Optional pre-filled participant info (name/company) for personalization. */
    participantHint: jsonb("participant_hint").$type<{
      name?: string;
      company?: string;
      email?: string;
    }>(),
    maxSessions: integer("max_sessions"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("interview_links_token_idx").on(t.token)],
);

/** One run of an interview by one participant. Supports pause/resume. */
export const interviewSessions = pgTable(
  "interview_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    linkId: uuid("link_id")
      .notNull()
      .references(() => interviewLinks.id, { onDelete: "cascade" }),
    status: sessionStatusEnum("status").notNull().default("created"),
    locale: localeEnum("locale").notNull().default("es"),
    participantName: text("participant_name"),
    participantEmail: text("participant_email"),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    /** Opaque key stored in the participant's browser to resume the same session. */
    resumeKey: text("resume_key").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    /** Provider metadata (voice provider, model, cost estimate...). */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("interview_sessions_link_idx").on(t.linkId),
    index("interview_sessions_status_idx").on(t.status),
  ],
);

/** Transcript: one row per utterance, ordered by `seq`. */
export const transcriptTurns = pgTable(
  "transcript_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => interviewSessions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    role: turnRoleEnum("role").notNull(),
    text: text("text").notNull(),
    /** ms offset from session start (for audio alignment, analytics). */
    offsetMs: integer("offset_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("transcript_turns_session_seq_idx").on(t.sessionId, t.seq)],
);

/** Structured, LLM-generated result of a completed session. */
export const interviewSummaries = pgTable("interview_summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .unique()
    .references(() => interviewSessions.id, { onDelete: "cascade" }),
  /** Validated by `interviewSummarySchema` (src/server/services/summary.schema.ts). */
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  markdown: text("markdown").notNull(),
  model: text("model").notNull(),
  emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
  notionPageId: text("notion_page_id"),
  notionSyncedAt: timestamp("notion_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
