import { z } from "zod";
import { isOpen, normalizeDraft } from "@/features/landing/config";
import { PROGRESS_TOOL, realtimeInstructions } from "@/features/landing/realtime-prompt";
import { createRealtimeSession } from "@/integrations/voice/openai-realtime";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { emilyRepository } from "@/server/repositories/emily.repository";

const bodySchema = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,90}$/) });

/**
 * POST /api/voice/realtime — `{ slug }` → a short-lived realtime session for that Emily's
 * interview. Public (participants have no password): the script comes from the saved, open Emily;
 * rate-limited per IP to cap OpenAI spend.
 */
export async function POST(request: Request) {
  if (!env().OPENAI_API_KEY) return Response.json({ error: "not_configured" }, { status: 503 });
  if (!rateLimit(`realtime:${clientIp(request.headers)}`, 6, 10 * 60_000))
    return Response.json({ error: "rate_limited" }, { status: 429 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const row = await emilyRepository.find(parsed.data.slug);
  const draft = row && normalizeDraft(row.draft);
  if (!draft || !isOpen(draft)) return Response.json({ error: "not_available" }, { status: 404 });

  try {
    const session = await createRealtimeSession({
      instructions: realtimeInstructions(draft),
      voice: draft.voice,
      language: draft.locale,
      tools: [PROGRESS_TOOL],
    });
    return Response.json(session, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error("realtime session failed", { err: String(err) });
    return Response.json({ error: "upstream" }, { status: 502 });
  }
}
