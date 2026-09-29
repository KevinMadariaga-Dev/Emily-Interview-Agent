import { toErrorResponse } from "@/lib/errors";
import { interviewService } from "@/server/services/interview.service";

/** POST /api/sessions/:id/voice-token — short-lived credentials for the browser voice connection. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/sessions/[sessionId]/voice-token">,
) {
  try {
    const { sessionId } = await ctx.params;
    await interviewService.authorize(sessionId, request.headers.get("x-resume-key"));
    const credentials = await interviewService.createVoiceCredentials(sessionId);
    return Response.json(credentials, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
