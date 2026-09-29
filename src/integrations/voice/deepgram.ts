import "server-only";
import { env, requireEnv } from "@/lib/env";
import type { VoiceAgentProvider } from "./types";

/**
 * Deepgram Voice Agent API — bundles STT (Flux/Nova) + BYO LLM + TTS (Aura) in one socket.
 * Docs: https://developers.deepgram.com/docs/voice-agent
 *
 * TODO(integration):
 *  1. Set DEEPGRAM_API_KEY.
 *  2. Mint a short-lived token: POST https://api.deepgram.com/v1/auth/grant (Authorization: Token <key>).
 *  3. Browser opens wss://agent.deepgram.com/v1/agent/converse with that token and sends `agentSettings`
 *     as the first "Settings" message (see src/features/interview/hooks/use-voice-agent.ts).
 */
export const deepgramVoiceProvider: VoiceAgentProvider = {
  name: "deepgram",
  async createClientSession(config) {
    const apiKey = requireEnv("DEEPGRAM_API_KEY");

    const grant = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl_seconds: 60 }),
    });
    if (!grant.ok) throw new Error(`Deepgram grant error ${grant.status}: ${await grant.text()}`);
    const { access_token, expires_in } = (await grant.json()) as {
      access_token: string;
      expires_in: number;
    };

    return {
      provider: "deepgram",
      token: access_token,
      expiresAt: new Date(Date.now() + expires_in * 1000).toISOString(),
      // Shape of the Deepgram "Settings" message. Verify against current docs before go-live.
      agentSettings: {
        type: "Settings",
        audio: {
          input: { encoding: "linear16", sample_rate: 16000 },
          output: { encoding: "linear16", sample_rate: 24000, container: "none" },
        },
        agent: {
          language: config.locale,
          listen: { provider: { type: "deepgram", model: "nova-3" } },
          think: {
            provider: { type: "open_ai", model: env().LLM_MODEL },
            prompt: config.systemPrompt,
          },
          speak: {
            provider: {
              type: "deepgram",
              model: config.locale === "es" ? "aura-2-celeste-es" : "aura-2-thalia-en",
            },
          },
          greeting: config.greeting,
        },
      },
    };
  },
};
