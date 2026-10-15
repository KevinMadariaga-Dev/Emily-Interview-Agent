"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { fillFromSpeech } from "./ai";
import { missingFields, type Draft, type Patch } from "./config";
import { connectRealtime, type RealtimeCall, type RealtimeEvent } from "./realtime-client";
import { setupDirective, setupInstructions } from "./realtime-prompt";
import type { OrbMode } from "./voice-orb";
import type { VoiceState } from "./use-emily-voice";

/** A holding line with no question ("let me think how to fit it all…", "dame un segundo…"). */
export const isFiller = (text: string) =>
  !/[?？]/.test(text) &&
  /\b(d[eé]jame|dame un|un momento|un segundo|voy a (pensar|organizar)|let me|give me a|one (moment|sec))/i.test(
    text,
  );

/**
 * Voice setup on OpenAI Realtime: Emily answers in about a second (semantic turn detection, the
 * user can talk over her), while each thing the user says is turned into fields in the background
 * by fillFromSpeech. Every reply is steered with what's already noted and what's missing.
 */
export function useSetupRealtime({
  draftRef,
  onPatch,
  onMsg,
  onMode,
  onDone,
}: {
  draftRef: RefObject<Draft>;
  onPatch: (p: Patch) => void;
  onMsg: (from: "emily" | "you", text: string) => void;
  onMode: (m: OrbMode) => void;
  /** The user said that's all and the essentials are in: Emily said goodbye. */
  onDone: () => void;
}) {
  const rt = useRef<RealtimeCall | null>(null);
  const [active, setActive] = useState(false);
  const [state, setState] = useState<VoiceState>("idle");
  const [interim, setInterim] = useState("");
  const [filling, setFilling] = useState(false);
  const closing = useRef(false); // goodbye requested: hand over to the review once it's heard
  const paused = useRef(false);
  const skipGreeting = useRef(false);
  const nudged = useRef(false); // this turn already got a "now ask" nudge
  const replyWatch = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Background fill queue: one fillFromSpeech at a time, later answers batched together.
  const pending = useRef<string[]>([]);
  const running = useRef(false);
  const drained = useRef<(() => void)[]>([]);

  useEffect(() => () => rt.current?.close(), []);

  const es = () => draftRef.current.locale === "es";

  /** `scripted`: say exactly that line, with no setup rules to argue with (the goodbye). */
  function reply(directive = setupDirective(draftRef.current), scripted = false) {
    rt.current?.send({
      type: "response.create",
      response: scripted
        ? { instructions: directive, tool_choice: "none" }
        : { instructions: `${setupInstructions(draftRef.current.locale)}\n\n${directive}` },
    });
  }

  /** Semantic VAD sometimes commits a turn and never answers: nudge after 2.5 s of quiet. */
  function watchReply(on: boolean) {
    if (replyWatch.current) clearTimeout(replyWatch.current);
    replyWatch.current = on
      ? setTimeout(() => !paused.current && !closing.current && reply(), 2_500)
      : null;
  }

  async function pump() {
    if (running.current) return;
    running.current = true;
    setFilling(true);
    while (pending.current.length) {
      const said = pending.current.splice(0).join(" ");
      try {
        const { patch, done } = await fillFromSpeech(said, draftRef.current);
        const fields: Patch = { ...patch };
        delete fields.locale; // the language was chosen explicitly
        draftRef.current = { ...draftRef.current, ...fields } as Draft; // next fill builds on it
        onPatch(fields);
        if (done && !pending.current.length) void wrapUp(); // the model may miss setup_done
      } catch (err) {
        console.warn("[emily setup] fill failed:", err);
      }
    }
    running.current = false;
    setFilling(false);
    drained.current.splice(0).forEach((r) => r());
  }

  const settled = () =>
    running.current || pending.current.length
      ? new Promise<void>((r) => drained.current.push(r))
      : Promise.resolve();

  function heard(text: string) {
    if (text.trim().length < 2) return;
    pending.current.push(text.trim());
    void pump();
  }

  /** "That's all": once every answer is in, goodbye (or ask for what's still missing). */
  async function wrapUp() {
    if (closing.current) return;
    closing.current = true;
    // Cut any filler she started instead of calling setup_done silently ("let me confirm…").
    rt.current?.send({ type: "response.cancel" });
    rt.current?.send({ type: "output_audio_buffer.clear" });
    await settled();
    if (!rt.current) return;
    if (missingFields(draftRef.current).length) {
      closing.current = false;
      return reply();
    }
    const line = es()
      ? "¡Listo! Te muestro el resumen para que lo revises."
      : "All set! Here's the summary for you to review.";
    reply(
      es()
        ? `Eres Emily. Di exactamente esta frase, en español, y nada más: "${line}"`
        : `You are Emily. Say exactly this sentence, in English, and nothing else: "${line}"`,
      true,
    );
    setTimeout(() => closing.current && finish(), 12_000); // if "audio stopped" never comes
  }

  function finish() {
    if (!rt.current) return;
    close();
    onDone();
  }

  function onEvent(e: RealtimeEvent) {
    switch (e.type) {
      case "output_audio_buffer.started":
        setState("speaking");
        onMode("speaking");
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        setState("idle");
        onMode("listening");
        if (closing.current && e.type === "output_audio_buffer.stopped") finish();
        break;
      case "input_audio_buffer.speech_started":
        watchReply(false);
        setState("recording");
        setInterim("");
        onMode("listening");
        break;
      case "input_audio_buffer.speech_stopped":
        setState("transcribing");
        watchReply(true);
        break;
      case "input_audio_buffer.committed":
        watchReply(false);
        nudged.current = false;
        if (!paused.current && !closing.current) reply();
        break;
      case "response.created":
        watchReply(false);
        break;
      case "conversation.item.input_audio_transcription.delta":
        setInterim((t) => t + String(e.delta ?? ""));
        break;
      case "conversation.item.input_audio_transcription.completed": {
        const text = String(e.transcript ?? "").trim();
        setInterim("");
        setState((s) => (s === "transcribing" ? "idle" : s));
        if (text) {
          onMsg("you", text);
          heard(text);
        }
        break;
      }
      case "emily.interrupted":
        skipGreeting.current = false; // the greeting (on screen already) was cut: skip nothing else
        break;
      case "emily.said": // heard in full (interrupted replies never get here)
        if (skipGreeting.current) skipGreeting.current = false;
        else onMsg("emily", String(e.text));
        break;
      case "response.done": {
        const output = ((e.response as { output?: unknown[] })?.output ?? []) as {
          type: string;
          name?: string;
          call_id?: string;
        }[];
        const calls = output.filter((o) => o.type === "function_call" && o.name === "setup_done");
        for (const call of calls)
          rt.current?.send({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: call.call_id, output: "ok" },
          });
        if (calls.length) void wrapUp();
        // Every turn ends in a question. If she only said a filler ("let me think…"), she still
        // owes it: once per turn, so a confused model can't loop.
        const said = output
          .flatMap((o) => (o as { content?: { transcript?: string }[] }).content ?? [])
          .map((c) => c.transcript ?? "")
          .join(" ");
        const status = (e.response as { status?: string })?.status;
        if (
          status === "completed" &&
          isFiller(said) &&
          !skipGreeting.current &&
          !calls.length &&
          !closing.current &&
          !paused.current &&
          !nudged.current
        ) {
          nudged.current = true;
          reply(
            `${setupDirective(draftRef.current)}\n${es() ? "Ya dijiste una frase de espera: ahora haz directamente la pregunta, sin repetir el acuse." : "You already said a holding line: now ask the question directly, without repeating the acknowledgement."}`,
          );
        }
        break;
      }
      case "error": // the expected ones (nothing left to cancel) are filtered out upstream
        console.warn("[emily setup realtime]", e.error);
        break;
    }
  }

  /**
   * Opens the mic and the call, then Emily says `greeting`. False if realtime isn't available
   * (the caller falls back to the classic engine); a microphone error is thrown.
   */
  async function start(greeting: string, locale: "es" | "en"): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("mic-unavailable");
    // The mic first, still close to the tap (iOS prompts reliably).
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    try {
      const d = draftRef.current;
      const res = await fetch("/api/voice/realtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setup: true, locale, voice: d.voice }),
      });
      if (!res.ok) throw new Error(`realtime-session ${res.status}`);
      const { clientSecret } = (await res.json()) as { clientSecret: string };
      rt.current = await connectRealtime({ clientSecret, mic, onEvent });
    } catch (err) {
      mic.getTracks().forEach((t) => t.stop());
      console.warn("[emily setup] realtime unavailable, classic engine:", err);
      return false;
    }
    setActive(true);
    onMsg("emily", greeting); // shown now; her transcript of it is skipped
    skipGreeting.current = true;
    reply(locale === "es" ? `AHORA: di exactamente: "${greeting}"` : `NOW: say exactly: "${greeting}"`);
    return true;
  }

  function pause() {
    if (!rt.current) return;
    paused.current = true;
    watchReply(false);
    rt.current.mic.getAudioTracks().forEach((t) => (t.enabled = false));
    rt.current.audio.muted = true;
    rt.current.send({ type: "response.cancel" });
    rt.current.send({ type: "output_audio_buffer.clear" });
    setState("idle");
    onMode("listening");
  }

  function resume() {
    if (!rt.current) return;
    paused.current = false;
    rt.current.mic.getAudioTracks().forEach((t) => (t.enabled = true));
    rt.current.audio.muted = false;
    reply(
      es()
        ? "AHORA: el usuario pausó y volvió. Repite brevemente lo último que le pediste."
        : "NOW: the user paused and came back. Briefly repeat what you last asked.",
    );
  }

  /** A typed answer: Emily hears it like speech. */
  function sendText(text: string) {
    if (!rt.current) return;
    if (paused.current) resume();
    rt.current.interrupt(); // a typed answer takes the turn like speech does
    rt.current.send({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
    });
    onMsg("you", text);
    heard(text);
    reply();
  }

  function close() {
    watchReply(false);
    closing.current = false;
    rt.current?.close();
    rt.current = null;
    setActive(false);
    setState("idle");
    setInterim("");
  }

  return {
    active,
    state,
    interim,
    /** Fields are still being worked out from what the user said. */
    filling,
    start,
    pause,
    resume,
    close,
    sendText,
    /** Wait until every answer so far is in the fields (before the review). */
    settled,
    /** "I'm done talking": ends the user's turn now. */
    stop: () => rt.current?.send({ type: "input_audio_buffer.commit" }),
  };
}
