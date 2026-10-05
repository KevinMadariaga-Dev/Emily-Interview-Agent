"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GmailLogo, NotionLogo } from "./brand-logos";
import { Badge, EmilyOrb } from "./emily-orb";
import { DOMAIN, type EmilyConfig, type Question } from "./mock";
import { interviewTypes } from "./question-bank";

// ponytail: everything is client state; on "Terminar" call createTemplateWithLink + OAuth flows.

const input =
  "w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-2 focus:outline-accent";

const toSlug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "");

export const voices = [
  {
    id: "emily",
    name: "Emily",
    desc: "Femenina · cálida · Latam",
    lang: "es-MX",
    locale: "es",
    pitch: 1.1,
  },
  {
    id: "sofia",
    name: "Sofía",
    desc: "Femenina · profesional · México",
    lang: "es-MX",
    locale: "es",
    pitch: 1.2,
  },
  {
    id: "lucia",
    name: "Lucía",
    desc: "Femenina · España",
    lang: "es-ES",
    locale: "es",
    pitch: 1.1,
  },
  {
    id: "mateo",
    name: "Mateo",
    desc: "Masculina · neutral · Latam",
    lang: "es-MX",
    locale: "es",
    pitch: 0.8,
  },
  {
    id: "diego",
    name: "Diego",
    desc: "Masculina · Colombia",
    lang: "es-CO",
    locale: "es",
    pitch: 0.7,
  },
  {
    id: "olivia",
    name: "Olivia",
    desc: "Female · warm · US",
    lang: "en-US",
    locale: "en",
    pitch: 1.1,
  },
  { id: "ava", name: "Ava", desc: "Female · UK", lang: "en-GB", locale: "en", pitch: 1.2 },
  { id: "james", name: "James", desc: "Male · US", lang: "en-US", locale: "en", pitch: 0.8 },
] as const;

const newQuestion = (text = ""): Question => ({ id: crypto.randomUUID(), text, required: true });

const steps = ["Datos", "Preguntas", "Voz e idioma", "Participante", "Vigencia", "Conexiones"];

const blank: EmilyConfig = {
  slug: "",
  name: "",
  objective: "",
  locale: "es",
  voiceId: "emily",
  questions: [],
  participant: { name: "", company: "", email: "" },
  activeFrom: "",
  activeUntil: "",
  noExpiry: false,
  connections: { gmail: false, notion: false },
};

/**
 * Step-by-step Emily creation. Each step reveals the next one with an animation.
 * With `initial` it becomes the edit form: all steps open, "Guardar cambios" instead of "Terminar".
 */
export function EmilyWizard({
  initial,
  onSave,
}: {
  initial?: EmilyConfig;
  onSave: (c: EmilyConfig) => void;
}) {
  const editing = !!initial;
  const start = initial ?? blank;
  const [reached, setReached] = useState(editing ? steps.length + 1 : 1);
  const [thinking, setThinking] = useState(false);
  const [name, setName] = useState(start.name);
  const [slug, setSlug] = useState(start.slug);
  const [slugTouched, setSlugTouched] = useState(editing);
  const [objective, setObjective] = useState(start.objective);
  const [questions, setQuestions] = useState<Question[]>(start.questions);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiType, setAiType] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [locale, setLocale] = useState(start.locale);
  const [voiceId, setVoiceId] = useState(start.voiceId);
  const [participant, setParticipant] = useState(start.participant);
  const [activeFrom, setActiveFrom] = useState(start.activeFrom);
  const [activeUntil, setActiveUntil] = useState(start.activeUntil);
  const [noExpiry, setNoExpiry] = useState(start.noExpiry);
  const [connections, setConnections] = useState(start.connections);
  const [connecting, setConnecting] = useState<"gmail" | "notion" | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedAt, setSavedAt] = useState<EmilyConfig>(start);
  const [justSaved, setJustSaved] = useState(false);
  const stepRefs = useRef<(HTMLElement | null)[]>([]);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const url = `${DOMAIN}/${slug || "…"}`;
  const filled = questions.filter((q) => q.text.trim());
  const voice = voices.find((v) => v.id === voiceId) ?? voices[0];
  const current: EmilyConfig = {
    slug,
    name,
    objective,
    locale,
    voiceId,
    questions: filled,
    participant,
    activeFrom,
    activeUntil,
    noExpiry,
    connections,
  };
  const dirty = JSON.stringify(current) !== JSON.stringify(savedAt);
  const valid = name.trim() && slug && objective.trim().length >= 10 && filled.length > 0;

  function save() {
    onSave(current);
    setSavedAt(current);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
  }

  function discard() {
    setName(savedAt.name);
    setSlug(savedAt.slug);
    setObjective(savedAt.objective);
    setQuestions(savedAt.questions);
    setLocale(savedAt.locale);
    setVoiceId(savedAt.voiceId);
    setParticipant(savedAt.participant);
    setActiveFrom(savedAt.activeFrom);
    setActiveUntil(savedAt.activeUntil);
    setNoExpiry(savedAt.noExpiry);
    setConnections(savedAt.connections);
  }

  useEffect(() => {
    if (!editing && reached > 1)
      stepRefs.current[reached - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editing, reached]);

  const next = (step: number) => setReached((r) => Math.max(r, step + 1));

  function confirmBasics() {
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      if (questions.length === 0) setQuestions([newQuestion()]);
      next(1);
    }, 1600);
  }

  function generate() {
    const type = interviewTypes.find((t) => t.id === aiType);
    if (!type) return;
    setGenerating(true);
    setTimeout(() => {
      setQuestions(type.questions.map((q) => newQuestion(q)));
      setGenerating(false);
      setAiOpen(false);
    }, 1200);
  }

  const updateQuestion = (id: string, patch: Partial<Question>) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  function moveQuestion(from: number, to: number) {
    if (to < 0 || to >= questions.length || from === to) return;
    setQuestions((qs) => {
      const copy = [...qs];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item!);
      return copy;
    });
  }

  function preview(v: (typeof voices)[number]) {
    speechSynthesis.cancel();
    const text =
      v.locale === "es"
        ? `Hola, soy ${v.name}. Seré quien te haga la entrevista.`
        : `Hi, I'm ${v.name}. I'll be your interviewer today.`;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = v.lang;
    u.pitch = v.pitch;
    speechSynthesis.speak(u);
  }

  function connect(key: "gmail" | "notion") {
    if (connections[key]) return setConnections((c) => ({ ...c, [key]: false }));
    setConnecting(key);
    setTimeout(() => {
      setConnections((c) => ({ ...c, [key]: true }));
      setConnecting(null);
    }, 1000);
  }

  function finish() {
    dialogRef.current?.showModal();
  }

  function closeAndSave() {
    dialogRef.current?.close();
    onSave(current);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`https://${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — URL stays visible */
    }
  }

  const validity = validityOf(current);
  const goTo = (n: number) =>
    stepRefs.current[n - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });

  const Step = ({ n, children }: { n: number; children: React.ReactNode }) =>
    reached >= n ? (
      <section
        ref={(el) => {
          stepRefs.current[n - 1] = el;
        }}
        className="motion-safe:animate-reveal grid scroll-mt-6 grid-cols-[2rem_1fr] gap-4"
      >
        <div className="flex flex-col items-center">
          <span
            className={`grid h-8 w-8 place-items-center rounded-full text-sm font-semibold ${
              reached > n
                ? "bg-accent text-accent-foreground"
                : "border-accent text-accent border-2"
            }`}
          >
            {reached > n ? "✓" : n}
          </span>
          {n < steps.length && <span className="bg-border mt-2 w-px flex-1" />}
        </div>
        <Card className="mb-6 space-y-4">
          <h2 className="text-lg font-semibold">{steps[n - 1]}</h2>
          {children}
        </Card>
      </section>
    ) : null;

  const Continue = ({ step, disabled }: { step: number; disabled?: boolean }) =>
    reached === step ? (
      <div className="flex justify-end">
        <Button disabled={disabled} onClick={() => next(step)}>
          Continuar →
        </Button>
      </div>
    ) : null;

  return (
    <div className={editing ? "space-y-8" : "mx-auto max-w-3xl"}>
      {editing && (
        <>
          <h2 className="text-lg font-semibold">Detalle</h2>
          <EmilySummary c={savedAt} onEdit={goTo} />
          <h2 className="border-border border-t pt-8 text-lg font-semibold">
            Configuración editable
          </h2>
        </>
      )}
      <div>
        {Step({
          n: 1,
          children: (
            <>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Nombre de la entrevista</span>
                <input
                  className={input}
                  value={name}
                  placeholder="Ej. Discovery clínicas dentales"
                  autoFocus={!editing}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slugTouched) setSlug(toSlug(e.target.value));
                  }}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">URL</span>
                <div className="border-border bg-card focus-within:outline-accent flex rounded-md border focus-within:outline-2">
                  <span className="text-muted border-border border-r px-3 py-2 font-mono text-sm">
                    {DOMAIN}/
                  </span>
                  <input
                    className="flex-1 bg-transparent px-3 py-2 font-mono text-sm outline-none"
                    value={slug}
                    placeholder="prueba"
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlug(toSlug(e.target.value));
                    }}
                  />
                </div>
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Objetivo</span>
                <textarea
                  className={input}
                  rows={3}
                  value={objective}
                  placeholder="¿Qué quieres descubrir con esta entrevista?"
                  onChange={(e) => setObjective(e.target.value)}
                />
                <span className="text-muted text-xs">
                  Emily lo usa para mantener la conversación en foco y para generar preguntas.
                </span>
              </label>
              {thinking ? (
                <div role="status" className="flex flex-col items-center gap-3 py-4">
                  <EmilyOrb />
                  <p className="text-accent animate-pulse text-sm font-medium">
                    Emily está entendiendo tu objetivo…
                  </p>
                </div>
              ) : (
                reached === 1 && (
                  <div className="flex justify-end">
                    <Button
                      disabled={!name.trim() || !slug || objective.trim().length < 10}
                      onClick={confirmBasics}
                    >
                      Continuar →
                    </Button>
                  </div>
                )
              )}
            </>
          ),
        })}

        {Step({
          n: 2,
          children: (
            <>
              <button
                type="button"
                onClick={() => setAiOpen((o) => !o)}
                className="border-accent/40 bg-accent/5 hover:bg-accent/10 text-accent flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm font-medium"
              >
                ✨ Generar preguntas con IA
              </button>

              {aiOpen && (
                <div className="border-border motion-safe:animate-reveal space-y-3 rounded-lg border p-4">
                  <p className="text-sm font-medium">¿Qué tipo de conversación quieres?</p>
                  <div role="radiogroup" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {interviewTypes.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={aiType === t.id}
                        onClick={() => setAiType(t.id)}
                        className={`rounded-lg border p-3 text-left transition ${
                          aiType === t.id
                            ? "border-accent bg-accent/10"
                            : "border-border hover:border-accent/50"
                        }`}
                      >
                        <span className="text-sm font-medium">
                          {t.icon} {t.label}
                        </span>
                        <span className="text-muted mt-1 block text-xs">{t.desc}</span>
                      </button>
                    ))}
                  </div>
                  {aiType && (
                    <div className="bg-background rounded-md p-3 text-xs">
                      <p className="text-muted mb-1">Ejemplos de lo que Emily preguntará:</p>
                      <ul className="list-disc space-y-0.5 pl-4">
                        {interviewTypes
                          .find((t) => t.id === aiType)!
                          .questions.slice(0, 2)
                          .map((q) => (
                            <li key={q}>{q}</li>
                          ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setAiOpen(false)}>
                      Cancelar
                    </Button>
                    <Button disabled={!aiType || generating} onClick={generate}>
                      {generating ? "Generando…" : "Generar"}
                    </Button>
                  </div>
                </div>
              )}

              <ol className="space-y-2">
                {questions.map((q, i) => (
                  <li
                    key={q.id}
                    draggable
                    onDragStart={() => setDragId(q.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      moveQuestion(
                        questions.findIndex((x) => x.id === dragId),
                        i,
                      );
                      setDragId(null);
                    }}
                    onDragEnd={() => setDragId(null)}
                    className={`border-border bg-card motion-safe:animate-reveal flex items-center gap-2 rounded-lg border p-2 ${
                      dragId === q.id ? "opacity-40" : ""
                    }`}
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <span
                      className="text-muted cursor-grab px-1 select-none"
                      aria-hidden
                      title="Arrastrar"
                    >
                      ⋮⋮
                    </span>
                    <span className="text-muted w-5 text-sm">{i + 1}.</span>
                    <input
                      className={`${input} border-transparent`}
                      value={q.text}
                      placeholder="Escribe la pregunta"
                      aria-label={`Pregunta ${i + 1}`}
                      onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                    />
                    <label className="text-muted flex shrink-0 items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) => updateQuestion(q.id, { required: e.target.checked })}
                      />
                      Obligatoria
                    </label>
                    <span className="text-muted flex shrink-0">
                      <IconBtn label="Subir" onClick={() => moveQuestion(i, i - 1)}>
                        ↑
                      </IconBtn>
                      <IconBtn label="Bajar" onClick={() => moveQuestion(i, i + 1)}>
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
                onClick={() => setQuestions((qs) => [...qs, newQuestion()])}
              >
                + Agregar pregunta
              </Button>
              {Continue({ step: 2, disabled: filled.length === 0 })}
            </>
          ),
        })}

        {Step({
          n: 3,
          children: (
            <>
              <div
                role="radiogroup"
                aria-label="Idioma"
                className="bg-background inline-flex rounded-lg p-1"
              >
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
              <div role="radiogroup" aria-label="Voz" className="grid gap-2 sm:grid-cols-2">
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
                          preview(v);
                        }}
                        className="border-border hover:bg-background rounded-full border px-2.5 py-1 text-xs"
                      >
                        ▶
                      </button>
                    </div>
                  ))}
              </div>
              {Continue({ step: 3 })}
            </>
          ),
        })}

        {Step({
          n: 4,
          children: (
            <>
              <p className="text-muted text-sm">
                ¿Quién va a recibir a Emily? Déjalo vacío para un link abierto a cualquier persona.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ["name", "Nombre", "text", "María Pérez"],
                    ["company", "Empresa", "text", "Clínica Sonrisas"],
                    ["email", "Correo", "email", "maria@empresa.com"],
                  ] as const
                ).map(([key, label, type, ph]) => (
                  <label key={key} className="block space-y-1">
                    <span className="text-sm font-medium">{label}</span>
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
              {Continue({ step: 4 })}
            </>
          ),
        })}

        {Step({
          n: 5,
          children: (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Activar desde</span>
                  <input
                    type="datetime-local"
                    className={input}
                    value={activeFrom}
                    onChange={(e) => setActiveFrom(e.target.value)}
                  />
                  <span className="text-muted text-xs">Vacío = activa en cuanto la crees</span>
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Desactivar el</span>
                  <input
                    type="datetime-local"
                    className={input}
                    value={activeUntil}
                    min={activeFrom || undefined}
                    disabled={noExpiry}
                    onChange={(e) => setActiveUntil(e.target.value)}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={noExpiry}
                  onChange={(e) => setNoExpiry(e.target.checked)}
                />
                Sin fecha de caducidad
              </label>
              {Continue({ step: 5 })}
            </>
          ),
        })}

        {Step({
          n: 6,
          children: (
            <>
              <p className="text-muted text-sm">
                Conecta dónde quieres recibir los resultados de cada entrevista.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["gmail", "Gmail", "Recibe el resumen en tu correo", GmailLogo],
                    ["notion", "Notion", "Guarda cada entrevista como página", NotionLogo],
                  ] as const
                ).map(([key, label, desc, Logo]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => connect(key)}
                    aria-pressed={connections[key]}
                    className={`flex items-center gap-3 rounded-lg border p-4 text-left transition ${
                      connections[key]
                        ? "border-green-500/50 bg-green-500/5"
                        : "border-border hover:border-accent/50"
                    }`}
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-white shadow-sm">
                      <Logo className="h-6 w-6" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium">
                        {connecting === key
                          ? "Conectando…"
                          : connections[key]
                            ? `${label} conectado`
                            : `Conectar con ${label}`}
                      </span>
                      <span className="text-muted block text-xs">{desc}</span>
                    </span>
                    {connections[key] && <span className="text-green-600">✓</span>}
                  </button>
                ))}
              </div>
              {!editing && (
                <div className="flex justify-end pt-2">
                  <Button className="px-8 py-3" onClick={finish}>
                    Terminar
                  </Button>
                </div>
              )}
            </>
          ),
        })}

        {editing && (dirty || justSaved) && (
          <div
            role="status"
            className="border-border bg-card/95 motion-safe:animate-reveal sticky bottom-4 z-10 ml-12 flex items-center justify-between gap-3 rounded-xl border p-3 pl-5 shadow-lg backdrop-blur"
          >
            {dirty ? (
              <>
                <span className="text-sm">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full bg-amber-500" />
                  Tienes cambios sin guardar
                </span>
                <span className="flex gap-2">
                  <Button variant="ghost" onClick={discard}>
                    Descartar
                  </Button>
                  <Button disabled={!valid} onClick={save}>
                    Guardar cambios
                  </Button>
                </span>
              </>
            ) : (
              <span className="text-sm text-green-600 dark:text-green-400">
                ✓ Cambios guardados
              </span>
            )}
          </div>
        )}
      </div>

      <dialog
        ref={dialogRef}
        onCancel={(e) => {
          e.preventDefault();
          closeAndSave();
        }}
        className="bg-card text-foreground m-auto w-[min(32rem,calc(100%-2rem))] rounded-2xl p-0 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      >
        <div className="motion-safe:animate-reveal space-y-5 p-6 text-center">
          <div className="flex justify-center">
            <EmilyOrb />
          </div>
          <div>
            <p className="text-accent text-sm font-medium">🎉 ¡Tu Emily está lista!</p>
            <h2 className="mt-1 text-2xl font-semibold">{name}</h2>
            <p className="text-muted mt-2 text-sm">{objective}</p>
          </div>
          <div className="flex items-center gap-2">
            <code className="bg-background border-border flex-1 truncate rounded border px-3 py-2 text-left text-sm">
              https://{url}
            </code>
            <Button variant="secondary" onClick={copy}>
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-left text-sm">
            <Info
              label="Preguntas"
              value={`${filled.length} (${filled.filter((q) => q.required).length} obligatorias)`}
            />
            <Info
              label="Voz"
              value={`${voice.name} · ${locale === "es" ? "Español" : "English"}`}
            />
            <Info
              label="Participante"
              value={
                [participant.name, participant.company].filter(Boolean).join(" · ") ||
                "Link abierto"
              }
            />
            <Info label="Vigencia" value={validity} />
            <Info
              label="Resultados"
              value={
                [connections.gmail && "Gmail", connections.notion && "Notion"]
                  .filter(Boolean)
                  .join(" + ") || "Solo en el panel"
              }
            />
            <Info label="Estado" value="Activa" />
          </dl>
          <div className="flex gap-2">
            <Link
              href="/demo/entrevista"
              target="_blank"
              className="border-border hover:bg-background flex-1 rounded-lg border py-2 text-sm font-medium"
            >
              Probar entrevista ↗
            </Link>
            <Button className="flex-1" onClick={closeAndSave}>
              Ir a mis Emilys
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

const fmt = (v: string) =>
  v ? new Date(v).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" }) : "";

function validityOf(c: EmilyConfig) {
  return `${c.activeFrom ? `Desde ${fmt(c.activeFrom)}` : "Activa al crear"} · ${
    c.noExpiry || !c.activeUntil ? "sin caducidad" : `hasta ${fmt(c.activeUntil)}`
  }`;
}

/** Read-only overview of the saved config, one card per wizard section. */
function EmilySummary({ c, onEdit }: { c: EmilyConfig; onEdit: (step: number) => void }) {
  const voice = voices.find((v) => v.id === c.voiceId) ?? voices[0];
  const Box = ({
    n,
    className = "",
    children,
  }: {
    n: number;
    className?: string;
    children: React.ReactNode;
  }) => (
    <Card className={`space-y-3 p-5 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold">
          <span className="bg-accent/15 text-accent grid h-6 w-6 place-items-center rounded-full text-xs">
            {n}
          </span>
          {steps[n - 1]}
        </h3>
        <button onClick={() => onEdit(n)} className="text-accent text-xs hover:underline">
          Editar ↓
        </button>
      </div>
      {children}
    </Card>
  );
  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="text-sm">
      <dt className="text-muted text-xs">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Box({
        n: 1,
        children: (
          <dl className="space-y-3">
            {Row({ label: "Nombre", value: c.name })}
            {Row({ label: "URL", value: <code className="text-xs">{`${DOMAIN}/${c.slug}`}</code> })}
            {Row({ label: "Objetivo", value: c.objective })}
          </dl>
        ),
      })}
      {Box({
        n: 2,
        className: "xl:row-span-2",
        children: (
          <ol className="space-y-2">
            {c.questions.map((q, i) => (
              <li key={q.id} className="flex gap-2 text-sm">
                <span className="text-muted w-5 shrink-0">{i + 1}.</span>
                <span className="flex-1">{q.text}</span>
                {q.required && (
                  <Badge className="bg-accent/10 text-accent h-fit shrink-0">Obligatoria</Badge>
                )}
              </li>
            ))}
          </ol>
        ),
      })}
      {Box({
        n: 3,
        children: (
          <div className="flex items-center gap-3">
            <span className="bg-accent/15 text-accent grid h-10 w-10 place-items-center rounded-full font-semibold">
              {voice.name[0]}
            </span>
            <div className="text-sm">
              <p className="font-medium">{voice.name}</p>
              <p className="text-muted text-xs">
                {voice.desc} · {c.locale === "es" ? "Español" : "English"}
              </p>
            </div>
          </div>
        ),
      })}
      {Box({
        n: 4,
        children:
          c.participant.name || c.participant.company || c.participant.email ? (
            <dl className="grid grid-cols-2 gap-3">
              {Row({ label: "Nombre", value: c.participant.name || "—" })}
              {Row({ label: "Empresa", value: c.participant.company || "—" })}
              {Row({ label: "Correo", value: c.participant.email || "—" })}
            </dl>
          ) : (
            <p className="text-muted text-sm">Link abierto · cualquier persona puede responder</p>
          ),
      })}
      {Box({
        n: 5,
        children: (
          <dl className="grid grid-cols-2 gap-3">
            {Row({ label: "Activa desde", value: c.activeFrom ? fmt(c.activeFrom) : "Al crearla" })}
            {Row({
              label: "Se desactiva",
              value: c.noExpiry || !c.activeUntil ? "Sin caducidad" : fmt(c.activeUntil),
            })}
          </dl>
        ),
      })}
      {Box({
        n: 6,
        children: (
          <ul className="space-y-2 text-sm">
            {(
              [
                ["Gmail", c.connections.gmail, GmailLogo],
                ["Notion", c.connections.notion, NotionLogo],
              ] as const
            ).map(([label, on, Logo]) => (
              <li key={label} className="flex items-center gap-2">
                <Logo className="h-4 w-4" />
                {label}
                <span
                  className={`ml-auto text-xs ${on ? "text-green-600 dark:text-green-400" : "text-muted"}`}
                >
                  {on ? "✓ Conectado" : "Sin conectar"}
                </span>
              </li>
            ))}
          </ul>
        ),
      })}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background rounded-lg p-3">
      <dt className="text-muted text-xs">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
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
