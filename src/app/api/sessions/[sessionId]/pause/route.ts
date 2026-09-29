import { toErrorResponse } from "@/lib/errors";
import { interviewService } from "@/server/services/interview.service";

/** POST /api/sessions/:id/pause — participant left; the same link + resumeKey can continue later. */
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[sessionId]/pause">) {
  try {
    const { sessionId } = await ctx.params;
    await interviewService.authorize(sessionId, request.headers.get("x-resume-key"));
    await interviewService.pause(sessionId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
