import { z } from "zod";
import { voiceIds } from "@/features/landing/config";
import { openAiAudio } from "@/integrations/voice/openai-audio";
import { logger } from "@/lib/logger";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(600),
  language: z.enum(["es", "en"]).default("es"),
  voice: z.enum(voiceIds).optional(),
});

/** POST /api/voice/speak — `{ text, language, voice? }` → mp3 stream in Emily's voice. */
export async function POST(request: Request) {
  if (!openAiAudio.configured()) return Response.json({ error: "not_configured" }, { status: 503 });
  // TODO(security): public while there is no login — keep the rate limit until auth exists.
  if (!rateLimit(`tts:${clientIp(request.headers)}`, 30, 60_000))
    return Response.json({ error: "rate_limited" }, { status: 429 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  try {
    const audio = await openAiAudio.speak(
      parsed.data.text,
      parsed.data.language,
      parsed.data.voice,
    );
    return new Response(audio, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (err) {
    logger.error("speak failed", { err: String(err) });
    return Response.json({ error: "upstream" }, { status: 502 });
  }
}
