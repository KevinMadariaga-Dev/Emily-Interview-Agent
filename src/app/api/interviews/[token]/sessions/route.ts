import { toErrorResponse, ValidationError } from "@/lib/errors";
import { startSessionSchema } from "@/features/interview/schemas";
import { interviewService } from "@/server/services/interview.service";

/** POST /api/interviews/:token/sessions — start (or resume) an interview from a shareable link. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/interviews/[token]/sessions">,
) {
  try {
    const { token } = await ctx.params;
    const parsed = startSessionSchema.safeParse(await request.json());
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);
    // TODO(security): rate-limit by IP (e.g. Upstash Ratelimit) to prevent link abuse.
    const session = await interviewService.startOrResume(token, parsed.data);
    return Response.json(
      { sessionId: session.id, resumeKey: session.resumeKey, locale: session.locale },
      { status: 201 },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
