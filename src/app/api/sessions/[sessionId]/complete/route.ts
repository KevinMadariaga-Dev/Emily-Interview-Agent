import { after } from "next/server";
import { toErrorResponse } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { processDueJobs } from "@/server/jobs/worker";
import { interviewService } from "@/server/services/interview.service";

/**
 * POST /api/sessions/:id/complete — closes the interview and kicks off the pipeline:
 * summary (LLM) → email (Resend) + Notion page. Runs after the response is sent via `after()`;
 * the cron job retries anything that fails.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/sessions/[sessionId]/complete">,
) {
  try {
    const { sessionId } = await ctx.params;
    await interviewService.authorize(sessionId, request.headers.get("x-resume-key"));
    await interviewService.complete(sessionId);

    after(async () => {
      try {
        await processDueJobs(1); // summary
        await processDueJobs(2); // email + notion
      } catch (error) {
        logger.error("post-completion pipeline failed; cron will retry", {
          sessionId,
          error: String(error),
        });
      }
    });

    return Response.json({ status: "completed" });
  } catch (error) {
    return toErrorResponse(error);
  }
}
