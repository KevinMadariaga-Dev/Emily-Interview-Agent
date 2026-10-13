import "server-only";
import { desc, eq, like, or, sql } from "drizzle-orm";
import type { Draft, InterviewSummary } from "@/features/landing/config";
import { db, schema } from "@/server/db/client";

const { emilys, emilyResults } = schema;
type Lang = Draft["locale"];

/** Data-access layer: the ONLY place that knows about SQL/Drizzle for landing Emilys. */
export const emilyRepository = {
  async list() {
    return db().select().from(emilys).orderBy(desc(emilys.createdAt));
  },

  async find(slug: string) {
    const [row] = await db().select().from(emilys).where(eq(emilys.slug, slug)).limit(1);
    return row ?? null;
  },

  /** Slugs equal to `base` or `base-N`, to pick a free one. */
  async slugsLike(base: string) {
    const rows = await db()
      .select({ slug: emilys.slug })
      .from(emilys)
      .where(or(eq(emilys.slug, base), like(emilys.slug, `${base}-%`)));
    return rows.map((r) => r.slug);
  },

  async create(values: typeof emilys.$inferInsert) {
    const [row] = await db().insert(emilys).values(values).onConflictDoNothing().returning();
    return row ?? null; // null: slug already taken
  },

  async remove(slug: string) {
    await db().delete(emilys).where(eq(emilys.slug, slug)); // results cascade
  },

  async setTranslation(slug: string, lang: Lang, text: { project: string; objective: string }) {
    await db()
      .update(emilys)
      .set({
        translations: sql`${emilys.translations} || ${JSON.stringify({ [lang]: text })}::jsonb`,
      })
      .where(eq(emilys.slug, slug));
  },

  async listResults() {
    return db().select().from(emilyResults).orderBy(desc(emilyResults.createdAt));
  },

  async addResult(values: typeof emilyResults.$inferInsert) {
    const [row] = await db().insert(emilyResults).values(values).returning();
    return row!;
  },

  async setResultTranslation(id: string, lang: Lang, summary: InterviewSummary) {
    await db()
      .update(emilyResults)
      .set({
        translations: sql`${emilyResults.translations} || ${JSON.stringify({ [lang]: summary })}::jsonb`,
      })
      .where(eq(emilyResults.id, id));
  },
};
