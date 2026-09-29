"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { interviewApi } from "../api/client";
import { useVoiceAgent } from "../hooks/use-voice-agent";

type Props = {
  token: string;
  title: string;
  defaultLocale: "es" | "en";
  maxDurationMinutes: number;
  participantName: string | null;
};

const copy = {
  es: {
    consent: "Acepto que esta conversación se grabe y transcriba para fines de investigación.",
    start: "Comenzar entrevista",
    resume: "Continuar entrevista",
    end: "Terminar",
    thanks: "¡Gracias! Tu entrevista fue enviada.",
    duration: (m: number) => `Duración aproximada: ${m} min · Necesitarás tu micrófono.`,
  },
  en: {
    consent:
      "I agree that this conversation will be recorded and transcribed for research purposes.",
    start: "Start interview",
    resume: "Resume interview",
    end: "End",
    thanks: "Thank you! Your interview has been submitted.",
    duration: (m: number) => `Approx. duration: ${m} min · You'll need your microphone.`,
  },
} as const;

/** Participant flow: consent → connect voice → live transcript → complete. Supports resume. */
export function InterviewRoom({
  token,
  title,
  defaultLocale,
  maxDurationMinutes,
  participantName,
}: Props) {
  const storageKey = `emily:resume:${token}`;
  const [locale, setLocale] = useState<"es" | "en">(defaultLocale);
  const [consent, setConsent] = useState(false);
  const [session, setSession] = useState<{ sessionId: string; resumeKey: string } | null>(null);
  const [savedResumeKey, setSavedResumeKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const voice = useVoiceAgent({
    sessionId: session?.sessionId ?? null,
    resumeKey: session?.resumeKey ?? null,
  });
  const t = copy[locale];

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read-once from browser storage
      setSavedResumeKey(localStorage.getItem(storageKey));
    } catch {
      /* storage unavailable (private mode) — resume simply won't be offered */
    }
  }, [storageKey]);

  useEffect(() => {
    if (session && voice.status === "idle") void voice.connect();
  }, [session, voice]);

  useEffect(() => {
    if (voice.status !== "live") return;
    const id = setInterval(() => void voice.flush(), 5000);
    const onLeave = () => session && void interviewApi.pause(session.sessionId, session.resumeKey);
    window.addEventListener("pagehide", onLeave);
    return () => {
      clearInterval(id);
      window.removeEventListener("pagehide", onLeave);
    };
  }, [voice, session]);

  async function start() {
    setBusy(true);
    try {
      const res = await interviewApi.start(token, {
        consent: true,
        locale,
        participantName: participantName ?? undefined,
        resumeKey: savedResumeKey ?? undefined,
      });
      try {
        localStorage.setItem(storageKey, res.resumeKey);
      } catch {}
      setSession({ sessionId: res.sessionId, resumeKey: res.resumeKey });
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!session) return;
    setBusy(true);
    await voice.disconnect();
    await interviewApi.complete(session.sessionId, session.resumeKey);
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    setDone(true);
    setBusy(false);
  }

  if (done) return <Card className="text-center text-lg">{t.thanks}</Card>;

  return (
    <Card className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-muted mt-1 text-sm">{t.duration(maxDurationMinutes)}</p>
        </div>
        <select
          aria-label="Language"
          value={locale}
          disabled={!!session}
          onChange={(e) => setLocale(e.target.value as "es" | "en")}
          className="border-border bg-card rounded-md border px-2 py-1 text-sm"
        >
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      </div>

      {!session ? (
        <>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1"
            />
            {t.consent}
          </label>
          <Button disabled={!consent || busy} onClick={start} className="w-full py-3">
            {savedResumeKey ? t.resume : t.start}
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`h-2.5 w-2.5 rounded-full ${voice.status === "live" ? "bg-green-500" : "bg-amber-500"}`}
            />
            {voice.status}
            {voice.error && <span className="text-red-600">· {voice.error}</span>}
          </div>
          <ol aria-live="polite" className="max-h-80 space-y-2 overflow-y-auto text-sm">
            {voice.turns.map((turn, i) => (
              <li key={i} className={turn.role === "agent" ? "text-muted" : ""}>
                <strong>{turn.role === "agent" ? "Emily" : "You"}:</strong> {turn.text}
              </li>
            ))}
          </ol>
          <Button variant="secondary" disabled={busy} onClick={finish} className="w-full">
            {t.end}
          </Button>
        </>
      )}
    </Card>
  );
}
