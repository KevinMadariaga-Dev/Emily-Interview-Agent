import { toErrorResponse, ValidationError } from "@/lib/errors";
import { appendTurnsSchema } from "@/features/interview/schemas";
import { interviewService } from "@/server/services/interview.service";

/** POST /api/sessions/:id/turns — persist transcript turns as they happen (batched from the client). */
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[sessionId]/turns">) {
  try {
    const { sessionId } = await ctx.params;
    await interviewService.authorize(sessionId, request.headers.get("x-resume-key"));
    const parsed = appendTurnsSchema.safeParse(await request.json());
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);
    await interviewService.appendTurns(sessionId, parsed.data.turns);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
