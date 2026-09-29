import { env } from "@/lib/env";
import { toErrorResponse, UnauthorizedError } from "@/lib/errors";
import { processDueJobs } from "@/server/jobs/worker";

/** GET /api/cron/process-jobs — Vercel Cron (see vercel.json). Retries pending integration jobs. */
export async function GET(request: Request) {
  try {
    const secret = env().CRON_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
      throw new UnauthorizedError();
    const results = await processDueJobs(20);
    return Response.json({ processed: results.length, results });
  } catch (error) {
    return toErrorResponse(error);
  }
}
