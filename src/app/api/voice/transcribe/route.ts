import { openAiAudio } from "@/integrations/voice/openai-audio";
import { logger } from "@/lib/logger";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const MAX_BYTES = 8 * 1024 * 1024; // ~8 min of opus; the setup turns are short

/** POST /api/voice/transcribe — multipart `audio` (+ optional `language`) → `{ text }`. */
export async function POST(request: Request) {
  if (!openAiAudio.configured()) return Response.json({ error: "not_configured" }, { status: 503 });
  // TODO(security): public while there is no login — keep the rate limit until auth exists.
  if (!rateLimit(`stt:${clientIp(request.headers)}`, 20, 60_000))
    return Response.json({ error: "rate_limited" }, { status: 429 });

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || !audio.type.startsWith("audio/") || audio.size > MAX_BYTES)
    return Response.json({ error: "invalid_audio" }, { status: 400 });
  const language = form?.get("language") === "en" ? "en" : "es";

  try {
    return Response.json({ text: await openAiAudio.transcribe(audio, language) });
  } catch (err) {
    logger.error("transcribe failed", { err: String(err) });
    return Response.json({ error: "upstream" }, { status: 502 });
  }
}
