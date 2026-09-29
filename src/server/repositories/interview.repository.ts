import "server-only";
import { and, asc, desc, eq, max } from "drizzle-orm";
import { db, schema } from "@/server/db/client";

const {
  interviewLinks,
  interviewTemplates,
  interviewSessions,
  transcriptTurns,
  interviewSummaries,
} = schema;

/** Data-access layer: the ONLY place that knows about SQL/Drizzle for interviews. */
export const interviewRepository = {
  async findActiveLinkByToken(token: string) {
    const rows = await db()
      .select({ link: interviewLinks, template: interviewTemplates })
      .from(interviewLinks)
      .innerJoin(interviewTemplates, eq(interviewLinks.templateId, interviewTemplates.id))
      .where(and(eq(interviewLinks.token, token), eq(interviewLinks.isActive, true)))
      .limit(1);
    return rows[0] ?? null;
  },

  async createSession(values: typeof interviewSessions.$inferInsert) {
    const [row] = await db().insert(interviewSessions).values(values).returning();
    return row!;
  },

  async findSession(id: string) {
    return (
      (await db().query.interviewSessions.findFirst({ where: eq(interviewSessions.id, id) })) ??
      null
    );
  },

  async findSessionByResumeKey(linkId: string, resumeKey: string) {
    return (
      (await db().query.interviewSessions.findFirst({
        where: and(
          eq(interviewSessions.linkId, linkId),
          eq(interviewSessions.resumeKey, resumeKey),
        ),
      })) ?? null
    );
  },

  async updateSession(id: string, values: Partial<typeof interviewSessions.$inferInsert>) {
    const [row] = await db()
      .update(interviewSessions)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(interviewSessions.id, id))
      .returning();
    return row!;
  },

  async appendTurns(
    sessionId: string,
    turns: { role: "agent" | "participant"; text: string; offsetMs?: number }[],
  ) {
    if (turns.length === 0) return;
    const [{ last } = { last: null }] = await db()
      .select({ last: max(transcriptTurns.seq) })
      .from(transcriptTurns)
      .where(eq(transcriptTurns.sessionId, sessionId));
    const start = (last ?? 0) + 1;
    await db()
      .insert(transcriptTurns)
      .values(
        turns.map((t, i) => ({
          sessionId,
          seq: start + i,
          role: t.role,
          text: t.text,
          offsetMs: t.offsetMs,
        })),
      )
      .onConflictDoNothing();
  },

  async getTranscript(sessionId: string) {
    return db()
      .select()
      .from(transcriptTurns)
      .where(eq(transcriptTurns.sessionId, sessionId))
      .orderBy(asc(transcriptTurns.seq));
  },

  async getSessionWithTemplate(sessionId: string) {
    const rows = await db()
      .select({ session: interviewSessions, link: interviewLinks, template: interviewTemplates })
      .from(interviewSessions)
      .innerJoin(interviewLinks, eq(interviewSessions.linkId, interviewLinks.id))
      .innerJoin(interviewTemplates, eq(interviewLinks.templateId, interviewTemplates.id))
      .where(eq(interviewSessions.id, sessionId))
      .limit(1);
    return rows[0] ?? null;
  },

  async upsertSummary(values: typeof interviewSummaries.$inferInsert) {
    const [row] = await db()
      .insert(interviewSummaries)
      .values(values)
      .onConflictDoUpdate({
        target: interviewSummaries.sessionId,
        set: { data: values.data, markdown: values.markdown, model: values.model },
      })
      .returning();
    return row!;
  },

  async getSummary(sessionId: string) {
    return (
      (await db().query.interviewSummaries.findFirst({
        where: eq(interviewSummaries.sessionId, sessionId),
      })) ?? null
    );
  },

  async markSummary(sessionId: string, values: Partial<typeof interviewSummaries.$inferInsert>) {
    await db()
      .update(interviewSummaries)
      .set(values)
      .where(eq(interviewSummaries.sessionId, sessionId));
  },

  async listRecentSessions(limit = 50) {
    return db()
      .select({ session: interviewSessions, template: interviewTemplates })
      .from(interviewSessions)
      .innerJoin(interviewLinks, eq(interviewSessions.linkId, interviewLinks.id))
      .innerJoin(interviewTemplates, eq(interviewLinks.templateId, interviewTemplates.id))
      .orderBy(desc(interviewSessions.createdAt))
      .limit(limit);
  },
};
