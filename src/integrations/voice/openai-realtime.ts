import "server-only";
import { requireEnv } from "@/lib/env";
import type { VoiceAgentProvider } from "./types";

/**
 * OpenAI Realtime API (speech-to-speech over WebRTC) — alternative provider.
 * Docs: https://platform.openai.com/docs/guides/realtime
 *
 * TODO(integration):
 *  1. Set OPENAI_API_KEY and VOICE_PROVIDER=openai-realtime.
 *  2. Server mints an ephemeral client secret (below).
 *  3. Browser creates an RTCPeerConnection, adds the mic track and POSTs its SDP offer
 *     to https://api.openai.com/v1/realtime/calls with `Authorization: Bearer <token>`.
 *  4. Listen on the "oai-events" data channel for transcript events and POST them to our API.
 */
export const openAiRealtimeProvider: VoiceAgentProvider = {
  name: "openai-realtime",
  async createClientSession(config) {
    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: "gpt-realtime",
          instructions: config.systemPrompt,
          audio: {
            input: { transcription: { model: "gpt-4o-mini-transcribe", language: config.locale } },
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI realtime error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { value: string; expires_at: number };
    return {
      provider: "openai-realtime",
      token: json.value,
      expiresAt: new Date(json.expires_at * 1000).toISOString(),
      agentSettings: { greeting: config.greeting },
    };
  },
};
