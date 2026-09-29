import "server-only";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db, schema } from "@/server/db/client";

const { integrationJobs } = schema;
type JobType = (typeof integrationJobs.$inferSelect)["type"];

export const jobRepository = {
  /** Idempotent enqueue: a second call with the same (type, session) is a no-op. */
  async enqueue(type: JobType, sessionId: string, runAfter = new Date()) {
    await db()
      .insert(integrationJobs)
      .values({ type, payload: { sessionId }, idempotencyKey: `${type}:${sessionId}`, runAfter })
      .onConflictDoNothing({ target: integrationJobs.idempotencyKey });
  },

  /**
   * Atomically claims due jobs (FOR UPDATE SKIP LOCKED) so concurrent workers never
   * process the same job twice.
   */
  async claimDue(limit = 10) {
    return db().transaction(async (tx) => {
      const due = await tx
        .select({ id: integrationJobs.id })
        .from(integrationJobs)
        .where(
          and(eq(integrationJobs.status, "pending"), lte(integrationJobs.runAfter, new Date())),
        )
        .orderBy(asc(integrationJobs.runAfter))
        .limit(limit)
        .for("update", { skipLocked: true });
      if (due.length === 0) return [];
      return tx
        .update(integrationJobs)
        .set({
          status: "running",
          attempts: sql`${integrationJobs.attempts} + 1`,
          updatedAt: new Date(),
        })
        .where(sql`${integrationJobs.id} in ${due.map((d) => d.id)}`)
        .returning();
    });
  },

  async succeed(id: string) {
    await db()
      .update(integrationJobs)
      .set({ status: "succeeded", lastError: null, updatedAt: new Date() })
      .where(eq(integrationJobs.id, id));
  },

  /** Exponential backoff: 30s, 60s, 120s... then "dead" after maxAttempts. */
  async fail(
    job: { id: string; attempts: number; maxAttempts: number },
    error: string,
    retryAfterSeconds?: number,
  ) {
    const dead = job.attempts >= job.maxAttempts;
    const delay = (retryAfterSeconds ?? 30 * 2 ** (job.attempts - 1)) * 1000;
    await db()
      .update(integrationJobs)
      .set({
        status: dead ? "dead" : "pending",
        lastError: error.slice(0, 2000),
        runAfter: new Date(Date.now() + delay),
        updatedAt: new Date(),
      })
      .where(eq(integrationJobs.id, job.id));
  },
};
