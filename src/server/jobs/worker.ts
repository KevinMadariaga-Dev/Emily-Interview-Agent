import "server-only";
import { logger } from "@/lib/logger";
import { jobRepository } from "@/server/repositories/job.repository";
import { deliveryService } from "@/server/services/delivery.service";
import { summaryService } from "@/server/services/summary.service";

/**
 * Post-interview pipeline:
 *   generate_summary ──► send_email
 *                    └─► sync_notion
 * Triggered by: `after()` right after completion (fast path) + Vercel Cron every 5 min (safety net).
 */
export async function processDueJobs(limit = 10) {
  const jobs = await jobRepository.claimDue(limit);
  const results: { id: string; type: string; ok: boolean }[] = [];

  // Sequential on purpose: respects Notion's ~3 req/s limit and keeps LLM cost predictable.
  for (const job of jobs) {
    const { sessionId } = job.payload;
    try {
      switch (job.type) {
        case "generate_summary":
          await summaryService.generate(sessionId);
          await jobRepository.enqueue("send_email", sessionId);
          await jobRepository.enqueue("sync_notion", sessionId);
          break;
        case "send_email":
          await deliveryService.sendEmail(sessionId);
          break;
        case "sync_notion":
          await deliveryService.syncNotion(sessionId);
          break;
      }
      await jobRepository.succeed(job.id);
      results.push({ id: job.id, type: job.type, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryAfter = (error as { retryAfterSeconds?: number }).retryAfterSeconds;
      logger.error("job failed", {
        jobId: job.id,
        type: job.type,
        sessionId,
        attempt: job.attempts,
        message,
      });
      await jobRepository.fail(job, message, retryAfter);
      results.push({ id: job.id, type: job.type, ok: false });
    }
  }
  return results;
}
