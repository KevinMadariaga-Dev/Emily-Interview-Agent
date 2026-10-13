import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { Draft, InterviewSummary } from "@/features/landing/config";
import { localeEnum } from "./enums";

type Lang = Draft["locale"];

/**
 * An Emily created from the landing: her whole configuration (the Draft) keyed by the public
 * slug of her link (/e/<slug>). Card translations are a display cache for the other UI language.
 */
export const emilys = pgTable("emilys", {
  slug: text("slug").primaryKey(),
  draft: jsonb("draft").$type<Draft>().notNull(),
  translations: jsonb("translations")
    .$type<Partial<Record<Lang, { project: string; objective: string }>>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One finished interview with an Emily: ChatGPT's graded summary (+ its cached translation). */
export const emilyResults = pgTable(
  "emily_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emilySlug: text("emily_slug")
      .notNull()
      .references(() => emilys.slug, { onDelete: "cascade" }),
    project: text("project").notNull(),
    summary: jsonb("summary").$type<InterviewSummary>().notNull(),
    turns: integer("turns").notNull(),
    locale: localeEnum("locale").notNull(),
    translations: jsonb("translations")
      .$type<Partial<Record<Lang, InterviewSummary>>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("emily_results_slug_created_idx").on(t.emilySlug, t.createdAt)],
);
