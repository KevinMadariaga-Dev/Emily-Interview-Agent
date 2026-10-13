import "server-only";
import { env, requireEnv } from "@/lib/env";

const TTS_INSTRUCTIONS = {
  es: "Habla SIEMPRE en español latinoamericano neutro, con acento latino natural, incluso al pronunciar marcas o palabras en inglés. Voz femenina cálida y clara. Habla con calma y sin prisa, a un ritmo pausado (un poco más lento que una conversación normal), con pausas breves y naturales entre frases (sin silencios largos) y una entonación amable y profesional. Nunca cambies de idioma ni de acento.",
  en: "Always speak in clear, neutral American English, even for Spanish names or words. Warm, clear female voice. Speak calmly and unhurriedly, at a relaxed pace (a little slower than normal conversation), with brief, natural pauses between sentences (no long silences) and a kind, professional tone. Never switch language or accent.",
} as const;

// OpenAI occasionally stalls mid-response (seen: a 2-minute TTS). Bound every call so the
// interview never hangs: a line normally takes 1–4 s, a transcription 1–3 s.
const TTS_TIMEOUT_MS = 20_000;
const STT_TIMEOUT_MS = 30_000;

/**
 * OpenAI speech-to-text and text-to-speech via fetch (no SDK).
 * Docs: https://platform.openai.com/docs/guides/speech-to-text · /text-to-speech
 */
export const openAiAudio = {
  configured: () => !!env().OPENAI_API_KEY,

  async transcribe(audio: Blob, language?: "es" | "en") {
    const form = new FormData();
    // OpenAI infers the codec from the filename: Chrome records webm, Safari mp4.
    const ext = audio.type.match(/webm|mp4|m4a|mpeg|mp3|wav|ogg/)?.[0]?.replace("mpeg", "mp3");
    form.append("file", audio, `audio.${ext ?? "webm"}`);
    form.append("model", env().OPENAI_STT_MODEL);
    if (language) form.append("language", language);
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}` },
      body: form,
      signal: AbortSignal.timeout(STT_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`OpenAI STT ${res.status}: ${await res.text()}`);
    return ((await res.json()) as { text: string }).text;
  },

  /** The whole mp3 (buffered, not streamed: a stalled stream can't leave the browser waiting). */
  async speak(text: string, language: "es" | "en", voice?: string): Promise<ArrayBuffer> {
    const signal = AbortSignal.timeout(TTS_TIMEOUT_MS); // covers the response body too
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env().OPENAI_TTS_MODEL,
        voice: voice ?? env().OPENAI_TTS_VOICE,
        input: text,
        speed: 1,
        // Same fixed instructions on every line: language, accent and pace never drift.
        // (Only the gpt-4o TTS models accept them; validated: 48/48 Spanish clips.)
        ...(env().OPENAI_TTS_MODEL.startsWith("gpt-4o") && {
          instructions: TTS_INSTRUCTIONS[language],
        }),
        response_format: "mp3",
      }),
      signal,
    });
    if (!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${await res.text()}`);
    return res.arrayBuffer();
  },
};
