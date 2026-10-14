"use client";

import { useEffect, useRef, useState } from "react";
import {
  aiStatus,
  interviewTurn,
  summarizeInterview,
  type InterviewSummary,
  type Turn,
} from "./ai";
import type { Draft } from "./config";
import {
  saveInterviewToNotion,
  sendInterviewReport,
  type NotionStatus,
  type ReportStatus,
} from "./report";
import { saveResult } from "./store";
import { friendlyError, micError } from "./ui";
import { connectRealtime, type RealtimeCall, type RealtimeEvent } from "./realtime-client";
import { realtimeInstructions, turnDirective } from "./realtime-prompt";
import { useEmilyVoice, type VoiceState } from "./use-emily-voice";
import type { OrbMode } from "./voice-orb";

export type InterviewPhase = "ready" | "live" | "summarizing" | "done";

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);

/**
 * One interview session with a created Emily (shared by the in-page test and the public page):
 * Emily asks with OpenAI TTS, listens hands-free (OpenAI STT, or typed answers), ChatGPT decides
 * the next line and follow-ups, and at the end ChatGPT summarizes and grades the answers.
 */
export function useInterviewSession({
  draft,
  slug,
  onMode,
}: {
  draft: Draft;
  /** The saved Emily: the result, email and Notion page are stored under it. */
  slug: string;
  onMode: (m: OrbMode) => void;
}) {
  const [openai, setOpenai] = useState(false);
  // Voice engine: server default (VOICE_ENGINE), overridable with ?engine=realtime|classic (A/B).
  const engine = useRef<"realtime" | "classic">("classic");
  const rt = useRef<RealtimeCall | null>(null);
  const [rtState, setRtState] = useState<VoiceState>("idle");
  const [rtInterim, setRtInterim] = useState("");
  const [realtime, setRealtime] = useState(false); // this session runs on the realtime engine
  const askingRef = useRef(-1);
  const doneRef = useRef(false); // Emily said goodbye: finish once her audio ends
  const replyWatch = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silentReplies = useRef(0); // consecutive tool-only replies (loop guard)
  const askedTimes = useRef<number[]>([]); // how often each question was asked (follow-ups)

  /** Emily's next reply, steered: the script plus what this turn must do. */
  function reply(extra?: string) {
    const i = askingRef.current;
    rt.current?.send({
      type: "response.create",
      response: {
        instructions: `${realtimeInstructions(draft)}\n\n${extra ?? turnDirective(draft, i, askedTimes.current[i] ?? 0)}`,
      },
    });
  }

  /**
   * Safety net for semantic turn detection: it answers fast when the idea is clearly finished,
   * but in tests it sometimes committed the user's turn and never started a reply. If nothing
   * starts within REPLY_WATCH_MS (and the user didn't keep talking), ask Emily to answer.
   */
  const REPLY_WATCH_MS = 2_500;
  function watchReply(on: boolean) {
    if (replyWatch.current) clearTimeout(replyWatch.current);
    replyWatch.current = on
      ? setTimeout(() => {
          if (!pausedRef.current && !ending.current) reply();
        }, REPLY_WATCH_MS)
      : null;
  }
  const [phase, setPhase] = useState<InterviewPhase>("ready");
  const [history, setHistory] = useState<Turn[]>([]);
  const [covered, setCovered] = useState(0);
  const [asking, setAsking] = useState(-1); // required question on screen (-1: presentation)
  const [summary, setSummary] = useState<InterviewSummary | null>(null);
  const [report, setReport] = useState<ReportStatus | "sending" | null>(null);
  const [notion, setNotion] = useState<NotionStatus | "saving" | null>(null);
  const [error, setError] = useState("");
  const voice = useEmilyVoice({ openai, locale: draft.locale, voice: draft.voice, onMode });
  const hist = useRef<Turn[]>([]);
  const alive = useRef(true);
  const ending = useRef(false);
  const pendingTyped = useRef(""); // a typed answer replaces the recording in progress
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const resumeRef = useRef<(() => void) | null>(null); // resolves the wait while paused
  const waitResume = () => new Promise<void>((r) => (resumeRef.current = r));
  const live = () => alive.current && !ending.current;

  /** Emily's line. If paused before or during it, she waits and then says it again. */
  async function sayLine(text: string) {
    do {
      if (pausedRef.current) await waitResume();
      if (!live()) return;
      await voice.say(text);
    } while (pausedRef.current && live());
  }

  useEffect(() => {
    alive.current = true;
    return () => {
      rt.current?.close(); // leaving the page ends the call
    };
  }, []);

  useEffect(() => {
    alive.current = true;
    aiStatus()
      .then((s) => {
        setOpenai(s.voice);
        const forced = new URLSearchParams(window.location.search).get("engine");
        engine.current =
          forced === "realtime" || forced === "classic" ? forced : (s.engine ?? "classic");
      })
      .catch(() => {});
    return () => {
      alive.current = false;
    };
  }, []);

  const push = (t: Turn) => {
    hist.current = [...hist.current, t];
    setHistory(hist.current);
  };

  /** Pauses the conversation: Emily stops talking/listening until `resume()`. */
  function pause() {
    if (phase !== "live" || pausedRef.current) return;
    pausedRef.current = true;
    setPaused(true);
    if (rt.current) {
      // Realtime: mute the mic, silence Emily and drop her reply in progress.
      rt.current.mic.getAudioTracks().forEach((t) => (t.enabled = false));
      rt.current.audio.muted = true;
      rt.current.send({ type: "response.cancel" });
      rt.current.send({ type: "output_audio_buffer.clear" });
    } else voice.cancel();
    onMode("listening");
  }

  function resume() {
    pausedRef.current = false;
    setPaused(false);
    if (rt.current) {
      rt.current.mic.getAudioTracks().forEach((t) => (t.enabled = true));
      rt.current.audio.muted = false;
      reply(
        draft.locale === "es"
          ? "AHORA: el participante pausó y volvió. Repite brevemente tu última pregunta, sin llamar herramientas."
          : "NOW: the participant paused and came back. Briefly repeat your last question, without calling tools.",
      );
    }
    resumeRef.current?.();
    resumeRef.current = null;
  }

  // ── Realtime engine (speech-to-speech over WebRTC) ────────────────────────────────────────────

  function closeRealtime() {
    watchReply(false);
    rt.current?.close();
    rt.current = null;
    setRtState("idle");
    setRtInterim("");
  }

  function onRealtimeEvent(e: RealtimeEvent) {
    switch (e.type) {
      case "output_audio_buffer.started":
        setRtState("speaking");
        onMode("speaking");
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        setRtState("idle");
        onMode("listening");
        if (doneRef.current && !ending.current) void finish(); // after her goodbye is heard
        break;
      case "input_audio_buffer.speech_started":
        watchReply(false); // still talking
        setRtState("recording");
        setRtInterim("");
        onMode("listening");
        break;
      case "input_audio_buffer.speech_stopped":
        setRtState("transcribing");
        watchReply(true);
        break;
      case "input_audio_buffer.committed":
        watchReply(false);
        if (!pausedRef.current && !ending.current && !doneRef.current) reply(); // the user's turn ended
        break;
      case "response.created":
        watchReply(false); // Emily is answering
        break;
      case "conversation.item.input_audio_transcription.delta":
        setRtInterim((t) => t + String(e.delta ?? ""));
        break;
      case "conversation.item.input_audio_transcription.completed": {
        const text = String(e.transcript ?? "").trim();
        setRtInterim("");
        if (text) push({ role: "participant", text, q: Math.max(askingRef.current, 0) });
        break;
      }
      case "response.output_audio_transcript.done": {
        const text = String(e.transcript ?? "").trim();
        if (text) push({ role: "emily", text });
        break;
      }
      case "response.done": {
        // Progress tool calls: keep the question card in sync, answer them, finish at the end.
        const output = ((e.response as { output?: unknown[] })?.output ?? []) as {
          type: string;
          name?: string;
          call_id?: string;
          arguments?: string;
          content?: { transcript?: string }[];
        }[];
        const said = output
          .flatMap((o) => o.content ?? [])
          .map((c) => c.transcript ?? "")
          .join(" ")
          .trim();
        const calls = output.filter(
          (o) => o.type === "function_call" && o.name === "report_progress",
        );
        for (const call of calls) {
          let args: { asking?: number; done?: boolean } = {};
          try {
            args = JSON.parse(call.arguments ?? "{}");
          } catch {}
          const i = typeof args.asking === "number" ? args.asking : -1;
          if (i >= 0 && i < draft.questions.length) {
            askedTimes.current[i] = (askedTimes.current[i] ?? 0) + 1;
            askingRef.current = i;
            setAsking(i);
            setCovered(i);
          }
          if (args.done) {
            doneRef.current = true;
            setCovered(draft.questions.length);
          }
          rt.current?.send({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: call.call_id, output: "ok" },
          });
        }
        // After a progress call Emily may still owe her line: she spoke a lead-in but not the
        // question yet ("Perfecto, gracias…" + tool call), said nothing, or marked the end
        // before saying goodbye. Let her continue then — not when she already asked (ends in ?).
        // At most 2 continuations in a row, so a confused model can't loop.
        const spoke = output.some((o) => o.type === "message");
        const asked = /[?？]\s*$/.test(said);
        const owesLine = calls.length > 0 && (doneRef.current ? !spoke : !asked);
        silentReplies.current = owesLine ? silentReplies.current + 1 : 0;
        if (owesLine && silentReplies.current <= 2)
          reply(
            doneRef.current
              ? draft.locale === "es"
                ? "AHORA: despídete en una frase agradeciendo su tiempo. No llames herramientas."
                : "NOW: say goodbye in one sentence thanking them for their time. Don't call tools."
              : draft.locale === "es"
                ? `AHORA: di en voz alta, casi textual, la pregunta [${askingRef.current}] "${draft.questions[askingRef.current]?.text ?? ""}". No llames herramientas.`
                : `NOW: say out loud, almost word for word, question [${askingRef.current}] "${draft.questions[askingRef.current]?.text ?? ""}". Don't call tools.`,
          );
        if (doneRef.current && !ending.current) {
          // Fallback if the "audio stopped" event never arrives after the goodbye.
          setTimeout(() => !ending.current && void finish(), spoke ? 12_000 : 20_000);
        }
        break;
      }
      case "error":
        console.warn("[emily realtime]", e.error);
        break;
    }
  }

  /** Starts the realtime call; false if it couldn't (the classic engine takes over). */
  async function startRealtime(): Promise<boolean> {
    try {
      const res = await fetch("/api/voice/realtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) throw new Error(`realtime-session ${res.status}`);
      const { clientSecret } = (await res.json()) as { clientSecret: string };
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("mic-unavailable");
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      rt.current = await connectRealtime({ clientSecret, mic, onEvent: onRealtimeEvent });
      if (!alive.current) return (closeRealtime(), true);
      setRealtime(true);
      reply(); // Emily opens: introduction + first question
      return true;
    } catch (err) {
      closeRealtime();
      // A microphone problem would break the classic engine too: explain it instead.
      const id = err instanceof Error ? `${err.name} ${err.message}` : String(err);
      if (/NotAllowed|NotFound|NotReadable|Security|mic-unavailable/.test(id)) {
        setError(micError(err, draft.locale));
        onMode("listening");
        return true;
      }
      console.warn("[emily realtime] falling back to classic:", id);
      return false;
    }
  }

  async function finish() {
    if (ending.current) return;
    if (pausedRef.current) resume();
    ending.current = true;
    closeRealtime();
    voice.cancel();
    setPhase("summarizing");
    onMode("speaking");
    try {
      const result = await summarizeInterview(slug, hist.current);
      setSummary(result);
      const answered = hist.current.some((t) => t.role === "participant");
      if (answered)
        saveResult(slug, result, hist.current).catch((err) =>
          setError(
            friendlyError(
              err,
              draft.locale === "es"
                ? "No pude guardar el resultado."
                : "I couldn't save the result.",
            ),
          ),
        );
      // Email the report (Gmail/Resend) to the Emily's report address; never blocks the ending.
      // Same report into Notion (skipped server-side when Notion isn't configured).
      if (answered) {
        setNotion("saving");
        saveInterviewToNotion(slug, result, hist.current)
          .then(setNotion)
          .catch(() => setNotion({ saved: false, reason: "failed" }));
      }
      if (answered && draft.reportEmail) {
        setReport("sending");
        sendInterviewReport(slug, result, hist.current)
          .then(setReport)
          .catch(() => setReport({ sent: false, reason: "failed" }));
      }
    } catch (err) {
      setError(
        friendlyError(
          err,
          draft.locale === "es" ? "No pude generar el resumen." : "I couldn't create the summary.",
        ),
      );
    } finally {
      setPhase("done");
      onMode("listening");
    }
  }

  async function run() {
    voice.unlock(); // still inside the "Comenzar" click
    setPhase("live");
    setError("");
    if (engine.current === "realtime" && (await startRealtime())) return;
    let silences = 0;
    try {
      while (alive.current && !ending.current) {
        const next = await withTimeout(interviewTurn(slug, hist.current), 30_000);
        if (!alive.current || ending.current) return;
        setCovered(next.covered);
        setAsking(next.asking);
        push({ role: "emily", text: next.say });
        await sayLine(next.say);
        if (next.done) return void (await finish());
        if (next.asking < 0) continue; // presentation: no answer expected, go to question 1

        let answer = "";
        while (!answer && alive.current && !ending.current) {
          answer = await voice.listen();
          if (pendingTyped.current) {
            answer = pendingTyped.current;
            pendingTyped.current = "";
          }
          if (pausedRef.current) {
            answer = ""; // paused while answering: after "Resume" she repeats the question
            await sayLine(next.say);
            continue;
          }
          if (!answer && !ending.current) {
            if (++silences > 2) return void (await finish());
            await voice.say(
              draft.locale === "es"
                ? "¿Sigues ahí? Tómate tu tiempo y responde cuando quieras."
                : "Are you still there? Take your time.",
            );
          }
        }
        silences = 0;
        if (answer) push({ role: "participant", text: answer, q: next.asking });
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message === "timeout"
          ? draft.locale === "es"
            ? "Emily tardó demasiado en responder. Revisa tu conexión y vuelve a intentarlo."
            : "Emily took too long to answer. Check your connection and try again."
          : micError(err, draft.locale),
      );
      onMode("listening");
    }
  }

  /** Answer by text instead of voice (only while Emily is listening). */
  function answerTyped(text: string) {
    if (rt.current) {
      if (!text.trim()) return false;
      rt.current.send({ type: "response.cancel" });
      rt.current.send({ type: "output_audio_buffer.clear" });
      rt.current.send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: text.trim() }],
        },
      });
      reply();
      push({ role: "participant", text: text.trim(), q: Math.max(askingRef.current, 0) });
      return true;
    }
    if (!text.trim() || voice.state !== "recording") return false;
    pendingTyped.current = text.trim();
    voice.cancel(); // drops the recording; the loop picks up the typed answer
    return true;
  }

  function restart() {
    hist.current = [];
    ending.current = false;
    setHistory([]);
    setCovered(0);
    setAsking(-1);
    setSummary(null);
    setReport(null);
    setNotion(null);
    setError("");
    pausedRef.current = false;
    setPaused(false);
    askingRef.current = -1;
    doneRef.current = false;
    silentReplies.current = 0;
    askedTimes.current = [];
    setRealtime(false);
    setPhase("ready");
  }

  function stopAll() {
    alive.current = false;
    closeRealtime();
    voice.cancel();
    resumeRef.current?.(); // free a loop waiting on "Resume"
  }

  return {
    openai,
    phase,
    history,
    covered,
    asking,
    summary,
    report,
    notion,
    error,
    // The UI reads the same voice shape from either engine.
    voice: realtime
      ? {
          ...voice,
          state: rtState,
          interim: rtInterim,
          // "Done answering": end the user's turn now.
          stop: () => rt.current?.send({ type: "input_audio_buffer.commit" }), // → committed → reply
        }
      : voice,
    realtime,
    paused,
    pause,
    resume,
    run,
    finish,
    answerTyped,
    restart,
    stopAll,
  };
}
