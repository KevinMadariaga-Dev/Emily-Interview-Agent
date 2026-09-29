"use client";

import { useCallback, useRef, useState } from "react";
import { interviewApi } from "../api/client";

export type Turn = { role: "agent" | "participant"; text: string; offsetMs?: number };
export type VoiceStatus = "idle" | "connecting" | "live" | "ended" | "error";

/**
 * Browser side of the voice agent (STT + LLM + TTS).
 *
 * The audio plumbing is intentionally left as documented TODOs — implement ONE provider:
 *
 * ── Deepgram Voice Agent (default) ───────────────────────────────────────────
 *   const ws = new WebSocket("wss://agent.deepgram.com/v1/agent/converse", ["bearer", creds.token]);
 *   ws.onopen = () => ws.send(JSON.stringify(creds.agentSettings));           // "Settings" message
 *   mic: getUserMedia({ audio: true }) → AudioWorklet → PCM16 @16kHz → ws.send(chunk)
 *   ws.onmessage: binary = agent audio (PCM16 @24kHz → play via AudioContext);
 *                 JSON { type: "ConversationText", role, content } → onTurn(...)
 *
 * ── OpenAI Realtime (VOICE_PROVIDER=openai-realtime) ──────────────────────────
 *   const pc = new RTCPeerConnection(); pc.addTrack(micTrack);
 *   pc.ontrack = (e) => (audioEl.srcObject = e.streams[0]);
 *   const dc = pc.createDataChannel("oai-events");
 *   POST SDP offer → https://api.openai.com/v1/realtime/calls (Authorization: Bearer creds.token)
 *   dc.onmessage: "conversation.item.input_audio_transcription.completed" → participant turn,
 *                 "response.output_audio_transcript.done" → agent turn.
 *
 * Turns are buffered and flushed to our API every few seconds (and on end) so a dropped
 * connection loses at most one batch. Keep this hook provider-agnostic: put each provider
 * in its own file under ./providers/ if both are implemented.
 */
export function useVoiceAgent(opts: { sessionId: string | null; resumeKey: string | null }) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const buffer = useRef<Turn[]>([]);
  const startedAt = useRef<number>(0);

  const flush = useCallback(async () => {
    if (!opts.sessionId || !opts.resumeKey || buffer.current.length === 0) return;
    const batch = buffer.current.splice(0, buffer.current.length);
    try {
      await interviewApi.appendTurns(opts.sessionId, opts.resumeKey, batch);
    } catch {
      buffer.current.unshift(...batch); // retry on next flush
    }
  }, [opts.sessionId, opts.resumeKey]);

  /** Call from provider event handlers whenever a final transcript segment arrives. */
  const onTurn = useCallback((turn: Omit<Turn, "offsetMs">) => {
    const t = { ...turn, offsetMs: Date.now() - startedAt.current };
    buffer.current.push(t);
    setTurns((prev) => [...prev, t]);
  }, []);

  const connect = useCallback(async () => {
    if (!opts.sessionId || !opts.resumeKey) return;
    setStatus("connecting");
    setError(null);
    try {
      const creds = await interviewApi.voiceToken(opts.sessionId, opts.resumeKey);
      startedAt.current = Date.now();
      // TODO(voice): open the provider connection with `creds` (see header comment) and
      // call onTurn() for each final transcript segment.
      void creds;
      setStatus("live");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect");
      setStatus("error");
    }
  }, [opts.sessionId, opts.resumeKey]);

  const disconnect = useCallback(async () => {
    // TODO(voice): close socket / peer connection and stop mic tracks.
    await flush();
    setStatus("ended");
  }, [flush]);

  return { status, turns, error, connect, disconnect, flush, onTurn };
}
