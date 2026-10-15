import "server-only";
import { env, requireEnv } from "@/lib/env";

// Realtime voices (the TTS-only "nova" isn't one): Emily's pick, or the closest female voice.
const REALTIME_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
];
export const realtimeVoice = (voice: string) => (REALTIME_VOICES.includes(voice) ? voice : "marin");

/**
 * OpenAI Realtime (speech-to-speech): mints a short-lived client secret for one interview.
 * The browser then talks to OpenAI directly over WebRTC with it — the API key never leaves the
 * server, and the instructions (the saved Emily) are fixed here, not by the browser.
 * Docs: https://platform.openai.com/docs/guides/realtime
 */
export async function createRealtimeSession(opts: {
  instructions: string;
  voice: string;
  language: "es" | "en";
  tools: unknown[];
  /** How soon a pause ends the turn: "high" for short setup answers, "auto" for interviews. */
  eagerness?: "auto" | "high";
  /** false: the user's voice never cuts Emily off (interviews: every question is heard whole). */
  interruptResponse?: boolean;
}) {
  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 600 }, // to connect, not the call length
      session: {
        type: "realtime",
        model: env().OPENAI_REALTIME_MODEL,
        instructions: opts.instructions,
        tools: opts.tools,
        tool_choice: "auto",
        audio: {
          input: {
            // Transcribed in the Emily's language only (saved with the result, sent to Notion).
            transcription: { model: env().OPENAI_STT_MODEL, language: opts.language },
            // Semantic turn detection: hears when the idea is finished and waits through
            // mid-sentence pauses; the user can interrupt Emily. Replies are started by the app
            // (create_response off) with a directive for each turn — see turnDirective().
            turn_detection: {
              type: "semantic_vad",
              eagerness: opts.eagerness ?? "auto",
              create_response: false,
              interrupt_response: opts.interruptResponse ?? true,
            },
            noise_reduction: { type: "near_field" },
          },
          output: { voice: realtimeVoice(opts.voice) },
        },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`OpenAI realtime ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { value: string };
  return { clientSecret: json.value, model: env().OPENAI_REALTIME_MODEL };
}
