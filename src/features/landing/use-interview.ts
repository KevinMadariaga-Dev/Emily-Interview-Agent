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
import { useEmilyVoice } from "./use-emily-voice";
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
    aiStatus()
      .then((s) => setOpenai(s.voice))
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
    voice.cancel();
    onMode("listening");
  }

  function resume() {
    pausedRef.current = false;
    setPaused(false);
    resumeRef.current?.();
    resumeRef.current = null;
  }

  async function finish() {
    if (pausedRef.current) resume();
    ending.current = true;
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
    setPhase("ready");
  }

  function stopAll() {
    alive.current = false;
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
    voice,
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
