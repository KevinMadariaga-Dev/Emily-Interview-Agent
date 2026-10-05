"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmilyOrb } from "./emily-orb";
import { sessionDetail, transcript } from "./mock";

// ponytail: scripted playback of the mock transcript; replace with useVoiceAgent (Deepgram).
const TOTAL_QUESTIONS = sessionDetail.answers.length;

type Step = "intro" | "live" | "paused" | "done";

/** Participant experience at emily.neoera/<slug>, simulated end to end. */
export function InterviewSim() {
  const [step, setStep] = useState<Step>("intro");
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState("");
  const [shown, setShown] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (step !== "live") return;
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    const talk = setInterval(() => {
      setShown((n) => {
        if (n >= transcript.length) {
          setStep("done");
          return n;
        }
        return n + 1;
      });
    }, 2200);
    return () => {
      clearInterval(tick);
      clearInterval(talk);
    };
  }, [step]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [shown]);

  const turns = transcript.slice(0, shown);
  const last = turns.at(-1);
  const emilySpeaking = step === "live" && last?.role === "agent";
  const question = Math.min(
    TOTAL_QUESTIONS,
    turns.filter((t) => t.role === "agent" && t.text.includes("?")).length - 1,
  );
  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  if (step === "done")
    return (
      <Card className="space-y-4 py-12 text-center">
        <div className="flex justify-center">
          <EmilyOrb speaking={false} />
        </div>
        <h1 className="text-2xl font-semibold">¡Gracias{name ? `, ${name}` : ""}!</h1>
        <p className="text-muted mx-auto max-w-sm">
          Tu entrevista fue enviada. Muchas gracias por tu tiempo, tus respuestas nos ayudan
          muchísimo.
        </p>
        <p className="text-muted text-xs">Duración: {mmss} · Ya puedes cerrar esta ventana.</p>
      </Card>
    );

  if (step === "intro")
    return (
      <Card className="flex flex-col items-center space-y-5 py-10 text-center">
        <EmilyOrb />
        <div>
          <p className="text-accent text-sm font-medium">Emily · AI Interviewer</p>
          <h1 className="mt-1 text-2xl font-semibold">Entrevista de prueba</h1>
          <p className="text-muted mt-2 text-sm">
            ~15 min · {TOTAL_QUESTIONS} preguntas · Necesitarás tu micrófono
          </p>
        </div>
        <div className="grid w-full max-w-sm gap-2 text-left">
          <input
            className="border-border bg-card w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Tu nombre (opcional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="border-border bg-card w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Empresa (opcional)"
          />
        </div>
        <label className="flex max-w-sm items-start gap-2 text-left text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1"
          />
          Acepto que esta conversación se grabe y transcriba para fines de investigación.
        </label>
        <Button
          disabled={!consent}
          onClick={() => setStep("live")}
          className="w-full max-w-sm py-3"
        >
          🎙 Comenzar entrevista
        </Button>
      </Card>
    );

  return (
    <Card className="space-y-6">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${step === "live" ? "animate-pulse bg-red-500" : "bg-amber-500"}`}
          />
          {step === "live" ? "En vivo" : "En pausa"} · {mmss}
        </span>
        <span className="text-muted">
          Pregunta {Math.max(question, 0)} de {TOTAL_QUESTIONS}
        </span>
      </div>
      <div className="bg-border h-1 overflow-hidden rounded-full">
        <div
          className="bg-accent h-full transition-all"
          style={{ width: `${(Math.max(question, 0) / TOTAL_QUESTIONS) * 100}%` }}
        />
      </div>

      <div className="flex flex-col items-center gap-3 py-4">
        <EmilyOrb speaking={emilySpeaking} size="lg" />
        <p className="text-muted text-sm">
          {step === "paused"
            ? "Pausada"
            : emilySpeaking
              ? "Emily está hablando…"
              : muted
                ? "Micrófono silenciado"
                : "Te escucho…"}
        </p>
      </div>

      <ol ref={listRef} aria-live="polite" className="max-h-64 space-y-3 overflow-y-auto">
        {turns.map((t, i) => (
          <li key={i} className={`flex ${t.role === "user" ? "justify-end" : ""}`}>
            <p
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                t.role === "agent" ? "bg-background" : "bg-accent text-accent-foreground"
              }`}
            >
              {t.text}
            </p>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" onClick={() => setMuted((m) => !m)}>
          {muted ? "🔇 Activar mic" : "🎤 Silenciar"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => setStep((s) => (s === "live" ? "paused" : "live"))}
        >
          {step === "live" ? "⏸ Pausar" : "▶ Continuar"}
        </Button>
        <Button variant="secondary" onClick={() => setStep("done")}>
          ⏹ Terminar
        </Button>
      </div>
    </Card>
  );
}
