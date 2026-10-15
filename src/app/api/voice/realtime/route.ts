import { z } from "zod";
import { isOpen, normalizeDraft } from "@/features/landing/config";
import {
  PROGRESS_TOOL,
  realtimeInstructions,
  SETUP_DONE_TOOL,
  setupInstructions,
} from "@/features/landing/realtime-prompt";
import { createRealtimeSession } from "@/integrations/voice/openai-realtime";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/server/auth/admin";
import { emilyRepository } from "@/server/repositories/emily.repository";

const bodySchema = z.union([
  z.object({ slug: z.string().regex(/^[a-z0-9-]{1,90}$/) }),
  z.object({
    setup: z.literal(true),
    locale: z.enum(["es", "en"]),
    voice: z.string().max(20).default("marin"),
  }),
]);

/**
 * POST /api/voice/realtime — a short-lived realtime session:
 * - `{ slug }`: that Emily's interview. Public (participants have no password): the script comes
 *   from the saved, open Emily.
 * - `{ setup, locale, voice }`: the voice setup studio (admin only).
 * Rate-limited per IP to cap OpenAI spend.
 */
export async function POST(request: Request) {
  if (!env().OPENAI_API_KEY) return Response.json({ error: "not_configured" }, { status: 503 });
  if (!rateLimit(`realtime:${clientIp(request.headers)}`, 6, 10 * 60_000))
    return Response.json({ error: "rate_limited" }, { status: 429 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const body = parsed.data;

  let opts: Parameters<typeof createRealtimeSession>[0];
  if ("setup" in body) {
    try {
      await requireAdmin();
    } catch {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    opts = {
      instructions: setupInstructions(body.locale),
      voice: body.voice,
      language: body.locale,
      tools: [SETUP_DONE_TOOL],
      eagerness: "high",
    };
  } else {
    const row = await emilyRepository.find(body.slug);
    const draft = row && normalizeDraft(row.draft);
    if (!draft || !isOpen(draft)) return Response.json({ error: "not_available" }, { status: 404 });
    opts = {
      instructions: realtimeInstructions(draft),
      voice: draft.voice,
      language: draft.locale,
      tools: [PROGRESS_TOOL],
      interruptResponse: false, // a question is never cut off: she listens once she's done
      // Turns end fast; the app then gives a mid-answer pause 2 s before Emily answers (and
      // drops that reply if they keep talking), so a pause never splits one answer in two.
      eagerness: "high",
    };
  }

  try {
    const session = await createRealtimeSession(opts);
    return Response.json(session, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error("realtime session failed", { err: String(err) });
    return Response.json({ error: "upstream" }, { status: 502 });
  }
}
