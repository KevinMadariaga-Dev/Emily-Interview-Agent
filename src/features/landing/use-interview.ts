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
import { micError } from "./ui";
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
  /** When set, the result is saved under this Emily (shown in "Resultados"). */
  slug?: string;
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

  async function finish() {
    ending.current = true;
    voice.cancel();
    setPhase("summarizing");
    onMode("speaking");
    try {
      const result = await summarizeInterview(draft, hist.current);
      setSummary(result);
      const answered = hist.current.some((t) => t.role === "participant");
      if (slug && answered) saveResult(slug, draft.project, result, hist.current.length);
      // Email the report (Gmail/Resend) to the Emily's report address; never blocks the ending.
      // Same report into Notion (skipped server-side when Notion isn't configured).
      if (answered) {
        setNotion("saving");
        saveInterviewToNotion(draft, result, hist.current)
          .then(setNotion)
          .catch(() => setNotion({ saved: false, reason: "failed" }));
      }
      if (answered && draft.reportEmail) {
        setReport("sending");
        sendInterviewReport(draft, result, hist.current)
          .then(setReport)
          .catch(() => setReport({ sent: false, reason: "failed" }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude generar el resumen.");
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
        const next = await withTimeout(interviewTurn(draft, hist.current), 30_000);
        if (!alive.current || ending.current) return;
        setCovered(next.covered);
        setAsking(next.asking);
        push({ role: "emily", text: next.say });
        await voice.say(next.say);
        if (next.done) return void (await finish());
        if (next.asking < 0) continue; // presentation: no answer expected, go to question 1

        let answer = "";
        while (!answer && alive.current && !ending.current) {
          answer = await voice.listen();
          if (pendingTyped.current) {
            answer = pendingTyped.current;
            pendingTyped.current = "";
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
        if (answer) push({ role: "participant", text: answer });
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message === "timeout"
          ? "Emily tardó demasiado en responder. Revisa tu conexión y vuelve a intentarlo."
          : micError(err),
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
    setPhase("ready");
  }

  function stopAll() {
    alive.current = false;
    voice.cancel();
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
    run,
    finish,
    answerTyped,
    restart,
    stopAll,
  };
}
