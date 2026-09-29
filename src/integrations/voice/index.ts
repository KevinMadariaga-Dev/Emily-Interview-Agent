import "server-only";
import { env } from "@/lib/env";
import { deepgramVoiceProvider } from "./deepgram";
import { openAiRealtimeProvider } from "./openai-realtime";
import type { VoiceAgentProvider } from "./types";

export function getVoiceProvider(): VoiceAgentProvider {
  return env().VOICE_PROVIDER === "openai-realtime"
    ? openAiRealtimeProvider
    : deepgramVoiceProvider;
}

export type { ClientVoiceCredentials, VoiceSessionConfig } from "./types";
