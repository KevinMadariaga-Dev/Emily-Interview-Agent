/**
 * Voice agent = STT (speech-to-text) + LLM (conversation) + TTS (text-to-speech).
 *
 * Architecture: the browser connects DIRECTLY to the voice provider (WebSocket/WebRTC)
 * for low latency. Our server never proxies audio; it only:
 *   1) mints a short-lived client credential (never expose the real API key), and
 *   2) builds the agent configuration (system prompt from the interview template).
 * Transcript turns are posted back to our API as they happen (see /api/sessions/[id]/turns).
 */
export type VoiceSessionConfig = {
  sessionId: string;
  locale: "es" | "en";
  systemPrompt: string;
  greeting: string;
};

export type ClientVoiceCredentials = {
  provider: "deepgram" | "openai-realtime";
  /** Short-lived token the browser uses to open the realtime connection. */
  token: string;
  expiresAt?: string;
  /** Provider-specific settings the browser sends when the socket opens. */
  agentSettings: Record<string, unknown>;
};

export interface VoiceAgentProvider {
  readonly name: ClientVoiceCredentials["provider"];
  createClientSession(config: VoiceSessionConfig): Promise<ClientVoiceCredentials>;
}
