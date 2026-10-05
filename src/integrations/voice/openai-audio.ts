import "server-only";
import { env, requireEnv } from "@/lib/env";

const TTS_INSTRUCTIONS = {
  es: "Habla SIEMPRE en español latinoamericano neutro, con acento latino natural, incluso al pronunciar marcas o palabras en inglés. Voz femenina cálida, clara, ritmo medio. Nunca cambies de idioma ni de acento.",
  en: "Always speak in clear, neutral American English, even for Spanish names or words. Warm female voice, medium pace. Never switch language or accent.",
} as const;

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
    });
    if (!res.ok) throw new Error(`OpenAI STT ${res.status}: ${await res.text()}`);
    return ((await res.json()) as { text: string }).text;
  },

  async speak(text: string, language: "es" | "en", voice?: string) {
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
    });
    if (!res.ok || !res.body) throw new Error(`OpenAI TTS ${res.status}: ${await res.text()}`);
    return res.body;
  },
};
