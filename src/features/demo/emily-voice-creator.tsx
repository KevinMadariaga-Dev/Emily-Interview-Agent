"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { planInterview } from "@/features/admin/plan-interview";
import { Badge, EmilyOrb } from "./emily-orb";
import { voices } from "./emily-wizard";
import type { EmilyConfig } from "./mock";
import type { InterviewPlan } from "./plan-fallback";

// Browser speech APIs (Chrome, Edge, Safari). Emily listens with SpeechRecognition and talks
// with speechSynthesis. ponytail: swap for Deepgram STT/TTS for better accuracy and voices.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
const getRecognition = () => {
  const w = window as unknown as Record<string, (new () => Recognition) | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

const GREETING = "¡Hola! Comenzaremos a crear la nueva Emily. ¿Qué quieres hacer hoy?";
const EXAMPLE =
  "Tengo que crear una lista de preguntas para conocer el modelo del negocio de un cliente. El negocio es de ropa, necesito preguntar si tienen sitio web, sistema de inventario, si han vendido alguna vez por internet, si saben usar un sitio web y si implementarían ventas por internet.";
const THINKING = [
  "Escuchando lo que me pediste…",
  "Detectando el propósito de la entrevista…",
  "Organizando tus preguntas…",
  "Agregando preguntas según el contexto…",
];

type Phase = "input" | "thinking" | "review" | "config";
type Q = InterviewPlan["questions"][number] & { id: string };
type Msg = { from: "emily" | "you"; text: string };

const input =
  "w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-2 focus:outline-accent";

const toSlug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Conversational creation: tell Emily (voice or text) what you need, review, configure, save. */
export function EmilyVoiceCreator({
  onSave,
  onUseForm,
}: {
  onSave: (c: EmilyConfig) => void;
  onUseForm: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("input");
  const [chat, setChat] = useState<Msg[]>([{ from: "emily", text: GREETING }]);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [micError, setMicError] = useState("");
  const [thinkingStep, setThinkingStep] = useState(0);
  const [source, setSource] = useState<"ai" | "local">("local");
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [context, setContext] = useState("");
  const [questions, setQuestions] = useState<Q[]>([]);
  const [participant, setParticipant] = useState({ name: "", company: "", email: "" });
  const [locale, setLocale] = useState<"es" | "en">("es");
  const [voiceId, setVoiceId] = useState("emily");
  const recRef = useRef<Recognition | null>(null);
  const mutedRef = useRef(muted);
  const chatEnd = useRef<HTMLDivElement>(null);

  function say(msg: string) {
    setChat((c) => [...c, { from: "emily", text: msg }]);
    speak(msg);
  }

  function speak(msg: string) {
    if (mutedRef.current || typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    const v = voices.find((x) => x.id === voiceId) ?? voices[0];
    const u = new SpeechSynthesisUtterance(msg);
    u.lang = v.lang;
    u.pitch = v.pitch;
    u.onstart = () => setSpeaking(true);
    u.onend = u.onerror = () => setSpeaking(false);
    speechSynthesis.speak(u);
  }

  // Greet once on open (the "+" click counts as the user gesture browsers require for audio).
  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(GREETING);
    u.lang = "es-MX";
    u.onstart = () => setSpeaking(true);
    u.onend = u.onerror = () => setSpeaking(false);
    speechSynthesis.speak(u);
    return () => {
      speechSynthesis.cancel();
      recRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [chat]);

  useEffect(() => {
    if (phase !== "thinking") return;
    const id = setInterval(() => setThinkingStep((s) => Math.min(s + 1, THINKING.length - 1)), 900);
    return () => clearInterval(id);
  }, [phase]);

  function toggleMute() {
    mutedRef.current = !muted;
    setMuted(!muted);
    if (!muted) speechSynthesis.cancel();
  }

  function toggleMic() {
    if (listening) return recRef.current?.stop();
    const Rec = getRecognition();
    if (!Rec) {
      setMicError("Tu navegador no permite dictado por voz. Usa Chrome o Edge, o escribe abajo.");
      return;
    }
    speechSynthesis.cancel();
    setMicError("");
    const base = text ? `${text.trim()} ` : "";
    const rec = new Rec();
    rec.lang = locale === "es" ? "es-MX" : "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let heard = "";
      for (let i = 0; i < e.results.length; i++) heard += e.results[i]![0]!.transcript;
      setText(base + heard);
    };
    rec.onerror = (e) =>
      setMicError(
        e.error === "not-allowed"
          ? "Necesito permiso para usar tu micrófono (ícono 🔒 en la barra de direcciones)."
          : `No pude escucharte (${e.error}). Intenta de nuevo o escribe.`,
      );
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  async function send() {
    const request = text.trim();
    if (request.length < 10) return;
    recRef.current?.stop();
    setChat((c) => [...c, { from: "you", text: request }]);
    setText("");
    setThinkingStep(0);
    setPhase("thinking");
    speak("Perfecto, déjame organizar la información.");
    try {
      const [res] = await Promise.all([
        planInterview(request),
        new Promise((r) => setTimeout(r, 3200)), // let the "thinking" animation play
      ]);
      const p = res.plan;
      setSource(res.source);
      setName(p.name);
      setObjective(p.objective);
      setContext(p.context);
      setQuestions(p.questions.map((q) => ({ ...q, id: crypto.randomUUID() })));
      const added = p.questions.filter((q) => q.suggested).length;
      setPhase("review");
      say(
        `Listo. Entendí que el objetivo es: ${p.objective} Organicé tus preguntas y agregué ${added} más según el contexto. Revísalas y confirma.`,
      );
    } catch {
      setPhase("input");
      setText(request);
      say("Uy, no pude procesarlo. ¿Me lo explicas de nuevo con un poco más de detalle?");
    }
  }

  const update = (id: string, patch: Partial<Q>) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) =>
    setQuestions((qs) => {
      const j = i + d;
      if (j < 0 || j >= qs.length) return qs;
      const copy = [...qs];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });

  const filled = questions.filter((q) => q.text.trim());

  function confirmQuestions() {
    setChat((c) => [...c, { from: "you", text: `Confirmo las ${filled.length} preguntas.` }]);
    setPhase("config");
    say("¡Preguntas guardadas! Ahora dime a quién se la envío, en qué idioma y con qué voz.");
  }

  function save() {
    speechSynthesis.cancel();
    onSave({
      slug: toSlug(name) || "nueva-emily",
      name,
      objective,
      locale,
      voiceId,
      questions: filled.map((q) => ({ id: q.id, text: q.text, required: q.required })),
      participant,
      activeFrom: "",
      activeUntil: "",
      noExpiry: true,
      connections: { gmail: false, notion: false },
    });
  }

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      {/* Emily + conversation */}
      <aside className="space-y-6 md:sticky md:top-6 md:self-start">
        <div className="flex flex-col items-center gap-3">
          <EmilyOrb speaking={speaking || phase === "thinking"} listening={listening} size="xl" />
          <p className="text-muted text-sm" aria-live="polite">
            {listening
              ? "🎙 Te escucho…"
              : phase === "thinking"
                ? THINKING[thinkingStep]
                : speaking
                  ? "Emily está hablando…"
                  : "Emily"}
          </p>
          <button onClick={toggleMute} className="text-muted hover:text-foreground text-xs">
            {muted ? "🔇 Voz de Emily apagada" : "🔊 Voz de Emily encendida"}
          </button>
        </div>
        <div className="max-h-[40vh] space-y-3 overflow-y-auto" aria-live="polite">
          {chat.map((m, i) => (
            <div key={i} className={`flex ${m.from === "you" ? "justify-end" : ""}`}>
              <p
                className={`motion-safe:animate-reveal max-w-[90%] rounded-2xl px-4 py-2 text-sm ${
                  m.from === "emily"
                    ? "bg-card border-border border"
                    : "bg-accent text-accent-foreground"
                }`}
              >
                {m.text}
              </p>
            </div>
          ))}
          <div ref={chatEnd} />
        </div>
      </aside>

      {/* Work area */}
      <section className="min-w-0 space-y-6">
        {phase === "input" && (
          <Card className="motion-safe:animate-reveal flex min-h-[70vh] flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold">Cuéntale a Emily qué necesitas</h2>
              <p className="text-muted text-sm">
                Escribe o dicta con tus palabras: para qué es la entrevista, a quién va dirigida y
                qué quieres preguntar.
              </p>
            </div>

            <textarea
              aria-label="Escribe lo que necesitas"
              className={`${input} min-h-64 flex-1 resize-none p-4 text-base leading-relaxed ${
                listening ? "outline-2 outline-green-500" : ""
              }`}
              value={text}
              placeholder="Ej. Tengo que crear una lista de preguntas para conocer el modelo de negocio de un cliente…"
              onChange={(e) => setText(e.target.value)}
            />

            {micError && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {micError}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={toggleMic}
                aria-pressed={listening}
                aria-label={listening ? "Dejar de grabar" : "Hablar con Emily"}
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-xl shadow transition ${
                  listening
                    ? "animate-pulse bg-red-500 text-white"
                    : "bg-accent text-accent-foreground hover:scale-105"
                }`}
              >
                {listening ? "■" : "🎙"}
              </button>
              <span className="text-muted flex-1 text-sm">
                {listening ? "Grabando… toca ■ para terminar" : "Toca 🎙 para dictar"}
              </span>
              <Button disabled={text.trim().length < 10} onClick={send}>
                Enviar a Emily →
              </Button>
            </div>

            <div className="border-border flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-sm">
              <button onClick={() => setText(EXAMPLE)} className="text-accent hover:underline">
                Usar ejemplo (tienda de ropa)
              </button>
              <button onClick={onUseForm} className="text-muted hover:underline">
                Prefiero el formulario paso a paso
              </button>
            </div>
          </Card>
        )}

        {phase === "thinking" && (
          <Card className="motion-safe:animate-reveal space-y-3 py-10">
            {THINKING.map((t, i) => (
              <p
                key={t}
                className={`flex items-center gap-3 text-sm transition ${
                  i <= thinkingStep ? "opacity-100" : "opacity-30"
                }`}
              >
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full text-xs ${
                    i < thinkingStep
                      ? "bg-accent text-accent-foreground"
                      : i === thinkingStep
                        ? "border-accent text-accent animate-pulse border-2"
                        : "border-border border"
                  }`}
                >
                  {i < thinkingStep ? "✓" : ""}
                </span>
                {t}
              </p>
            ))}
          </Card>
        )}

        {phase === "review" && (
          <>
            <Card className="motion-safe:animate-reveal grid gap-4 md:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-muted text-xs font-medium tracking-wide uppercase">
                  Nombre de la entrevista
                </span>
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <div className="space-y-1">
                <span className="text-muted text-xs font-medium tracking-wide uppercase">
                  Detectado
                </span>
                <div className="flex flex-wrap gap-2 pt-1">
                  {context && <Badge className="bg-accent/10 text-accent">Rubro: {context}</Badge>}
                  <Badge className="bg-accent/10 text-accent">{filled.length} preguntas</Badge>
                  <Badge className="text-muted bg-stone-500/15">
                    {source === "ai" ? "Organizado con IA" : "Organizado localmente (demo)"}
                  </Badge>
                </div>
              </div>
              <label className="block space-y-1 md:col-span-2">
                <span className="text-muted text-xs font-medium tracking-wide uppercase">
                  Propósito de la entrevista
                </span>
                <textarea
                  className={input}
                  rows={2}
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                />
              </label>
            </Card>

            <Card className="motion-safe:animate-reveal space-y-3 [animation-delay:150ms]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Verifica las preguntas</h2>
                <span className="text-muted flex gap-3 text-xs">
                  <span>
                    <Badge className="text-foreground bg-stone-500/15">Tú</Badge> las que pediste
                  </span>
                  <span>
                    <Badge className="bg-accent/10 text-accent">✨ Emily</Badge> sugeridas
                  </span>
                </span>
              </div>
              <ol className="space-y-2">
                {questions.map((q, i) => (
                  <li
                    key={q.id}
                    className="border-border motion-safe:animate-reveal flex flex-wrap items-center gap-2 rounded-lg border p-2 sm:flex-nowrap"
                    style={{ animationDelay: `${200 + i * 80}ms` }}
                  >
                    <span className="text-muted w-6 text-right text-sm">{i + 1}.</span>
                    <Badge
                      className={
                        q.suggested ? "bg-accent/10 text-accent" : "text-foreground bg-stone-500/15"
                      }
                    >
                      {q.suggested ? "✨ Emily" : "Tú"}
                    </Badge>
                    <input
                      className={`${input} min-w-0 flex-1 border-transparent`}
                      value={q.text}
                      aria-label={`Pregunta ${i + 1}`}
                      onChange={(e) => update(q.id, { text: e.target.value })}
                    />
                    <label className="text-muted flex shrink-0 items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) => update(q.id, { required: e.target.checked })}
                      />
                      Obligatoria
                    </label>
                    <span className="text-muted flex shrink-0">
                      <IconBtn label="Subir" onClick={() => move(i, -1)}>
                        ↑
                      </IconBtn>
                      <IconBtn label="Bajar" onClick={() => move(i, 1)}>
                        ↓
                      </IconBtn>
                      <IconBtn
                        label="Quitar"
                        onClick={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))}
                      >
                        ✕
                      </IconBtn>
                    </span>
                  </li>
                ))}
              </ol>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() =>
                  setQuestions((qs) => [
                    ...qs,
                    { id: crypto.randomUUID(), text: "", required: false, suggested: false },
                  ])
                }
              >
                + Agregar pregunta
              </Button>
              <div className="flex flex-wrap justify-between gap-2 pt-2">
                <Button variant="ghost" onClick={() => setPhase("input")}>
                  ← Explicar de nuevo
                </Button>
                <Button disabled={filled.length === 0 || !name.trim()} onClick={confirmQuestions}>
                  ✓ Confirmar y guardar preguntas
                </Button>
              </div>
            </Card>
          </>
        )}

        {phase === "config" && (
          <Card className="motion-safe:animate-reveal space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Configuración</h2>
              <Badge className="bg-green-500/15 text-green-700 dark:text-green-400">
                ✓ {filled.length} preguntas guardadas
              </Badge>
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">¿A quién se envía?</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ["name", "Nombre", "text", "María Pérez"],
                    ["company", "Empresa", "text", "Boutique Luna"],
                    ["email", "Correo", "email", "maria@boutiqueluna.com"],
                  ] as const
                ).map(([key, label, type, ph]) => (
                  <label key={key} className="block space-y-1">
                    <span className="text-muted text-xs">{label}</span>
                    <input
                      type={type}
                      className={input}
                      placeholder={ph}
                      value={participant[key]}
                      onChange={(e) => setParticipant((p) => ({ ...p, [key]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
              <p className="text-muted text-xs">Déjalo vacío para un link abierto a cualquiera.</p>
            </fieldset>

            <div className="space-y-2">
              <p className="text-sm font-medium">Idioma</p>
              <div role="radiogroup" className="bg-background inline-flex rounded-lg p-1">
                {(["es", "en"] as const).map((l) => (
                  <button
                    key={l}
                    role="radio"
                    aria-checked={locale === l}
                    onClick={() => {
                      setLocale(l);
                      setVoiceId(voices.find((v) => v.locale === l)!.id);
                    }}
                    className={`rounded-md px-4 py-1.5 text-sm ${
                      locale === l ? "bg-card font-medium shadow-sm" : "text-muted"
                    }`}
                  >
                    {l === "es" ? "Español" : "English"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Tipo de voz</p>
              <div role="radiogroup" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {voices
                  .filter((v) => v.locale === locale)
                  .map((v) => (
                    <div
                      key={v.id}
                      role="radio"
                      aria-checked={voiceId === v.id}
                      tabIndex={0}
                      onClick={() => setVoiceId(v.id)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setVoiceId(v.id)}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                        voiceId === v.id
                          ? "border-accent bg-accent/10"
                          : "border-border hover:border-accent/50"
                      }`}
                    >
                      <span className="bg-accent/15 text-accent grid h-10 w-10 shrink-0 place-items-center rounded-full font-semibold">
                        {v.name[0]}
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-medium">{v.name}</span>
                        <span className="text-muted block text-xs">{v.desc}</span>
                      </span>
                      <button
                        type="button"
                        aria-label={`Escuchar ${v.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          speechSynthesis.cancel();
                          const u = new SpeechSynthesisUtterance(
                            v.locale === "es"
                              ? `Hola, soy ${v.name}. Seré quien haga la entrevista.`
                              : `Hi, I'm ${v.name}. I'll be your interviewer.`,
                          );
                          u.lang = v.lang;
                          u.pitch = v.pitch;
                          speechSynthesis.speak(u);
                        }}
                        className="border-border hover:bg-background rounded-full border px-2.5 py-1 text-xs"
                      >
                        ▶
                      </button>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setPhase("review")}>
                ← Volver a preguntas
              </Button>
              <Button className="px-8 py-3" onClick={save}>
                Guardar Emily
              </Button>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="hover:bg-background hover:text-foreground rounded px-2 py-1"
    >
      {children}
    </button>
  );
}
