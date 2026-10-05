"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DOMAIN } from "@/features/demo/mock";
import { aiStatus, fillFromSpeech, generateFromPreset, refineQuestions } from "./ai";
import {
  missingFields,
  presets,
  toQuestions,
  voices,
  type Draft,
  type Patch,
  type PresetId,
  type QuestionKind,
  type VoiceId,
} from "./config";
import { InterviewLive } from "./interview-live";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckIcon,
  CopyIcon,
  InboxIcon,
  LinkIcon,
  MicIcon,
  PlayIcon,
  PlusIcon,
  SendIcon,
  SparkIcon,
  StopIcon,
  XIcon,
} from "./icons";
import { BubbleTrail, field, IconBtn, micError, primary, quiet, type Msg } from "./ui";
import { EmilyList, ResultsList } from "./saved-views";
import { saveEmily, uniqueSlug, useSavedEmilys } from "./store";
import { useEmilyVoice } from "./use-emily-voice";
import { VoiceOrb, type OrbMode } from "./voice-orb";

// ponytail: creation is client-only (no DB yet); wire "Crear Emily" to createTemplateWithLink.

const toSlug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

type Created = {
  slug: string;
  url: string;
  project: string;
  recipient: string;
  questions: number;
  areas: number;
  locale: "es" | "en";
  status: string;
  draft: Draft;
};

const EXIT_MS = 200;

const proofs = [
  {
    Icon: LinkIcon,
    title: "Un link y listo",
    body: "Tu cliente abre el enlace y habla. Sin apps ni registro.",
  },
  {
    Icon: MicIcon,
    title: "Conversación real",
    body: "Emily repregunta, se adapta y no pierde el objetivo.",
  },
  {
    Icon: InboxIcon,
    title: "Resumen accionable",
    body: "Hallazgos, dolores y citas en tu correo y en Notion.",
  },
];

/** Home. Closed: violet field with Emily + pitch. Open: field pinned left, setup on the right. */
export function Landing() {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [heroMode, setHeroMode] = useState<OrbMode>("speaking");
  const [voiceMode, setVoiceMode] = useState<OrbMode | null>(null);
  const [feed, setFeed] = useState<Msg[]>([]); // live conversation shown under Emily
  const [section, setSection] = useState<Section>("crear");
  const saved = useSavedEmilys();
  const wide = open || section !== "crear"; // content laid out for the narrow panel
  const [panel, setPanel] = useState(false); // violet panel narrowed (moves immediately)
  const [exiting, setExiting] = useState(false); // content fading out before the view swaps
  const [fromHero, setFromHero] = useState(false); // next entrance waits for the panel
  const rightRef = useRef<HTMLElement>(null);

  /**
   * Choreography for every view change: the panel starts moving now, the current content fades
   * out (EXIT_MS), the view swaps while invisible (no layout animation), the new content enters.
   */
  function swap(nextPanel: boolean, apply: () => void) {
    setFromHero(!panel && nextPanel);
    setPanel(nextPanel);
    setExiting(true);
    window.setTimeout(() => {
      apply();
      setExiting(false);
      window.scrollTo({ top: 0 });
    }, EXIT_MS);
  }

  // Hero: Emily alternates speaking/listening. Form: she listens (or follows voice mode).
  useEffect(() => {
    if (wide) return;
    const id = setInterval(
      () => setHeroMode((m) => (m === "speaking" ? "listening" : "speaking")),
      3800,
    );
    return () => clearInterval(id);
  }, [wide]);
  const mode: OrbMode = !panel
    ? heroMode
    : (voiceMode ?? (section === "crear" && created ? "speaking" : "listening"));

  function go(next: Section) {
    if (next === section) return;
    swap(true, () => {
      setVoiceMode(null);
      setFeed([]);
      setSection(next);
      if (next === "crear") setOpen(true);
    });
  }
  const openConfig = () => swap(true, () => setOpen(true));
  const closeConfig = () =>
    swap(false, () => {
      setVoiceMode(null);
      setFeed([]);
      setOpen(false);
    });

  const toTop = () => rightRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const caption = !wide
    ? "Emily · entrevistadora con IA"
    : section === "emilys"
      ? "Estas son las Emilys que has creado. Pruébame con cualquiera."
      : section === "resultados"
        ? "Aquí está lo que descubrí en cada entrevista."
        : created
          ? "Listo. Comparte el link y yo me encargo de la conversación."
          : voiceMode
            ? "Háblame con naturalidad. Voy llenando los campos por ti."
            : "Cuéntame con quién hablo y qué necesitas saber.";

  return (
    <div className="relative min-h-dvh md:[--panel:18rem] xl:[--panel:22rem]">
      {/* Violet field: Emily lives here. Fixed half-screen layer; "narrowing" is a clip-path, so
          nothing reflows while it moves. Emily's group slides with a transform to stay centered. */}
      <aside
        className={`bg-accent-deep relative flex flex-col overflow-hidden px-8 py-8 text-white motion-reduce:transition-none md:fixed md:inset-y-0 md:left-0 md:z-10 md:w-1/2 md:transition-[clip-path] md:duration-500 md:ease-in-out ${
          panel
            ? "md:[clip-path:inset(0_calc(100%_-_var(--panel))_0_0)]"
            : "md:delay-100 md:[clip-path:inset(0)]"
        }`}
      >
        <p className="text-sm font-semibold tracking-[0.3em] uppercase">
          NEO<span className="text-violet-300">era</span>
        </p>
        <div
          className={`flex flex-1 flex-col items-center justify-center gap-6 py-8 motion-reduce:transition-none md:transition-[translate] md:duration-500 md:ease-in-out ${
            panel ? "md:translate-x-[calc((var(--panel)_-_50vw)/2)]" : "md:delay-100"
          }`}
        >
          <VoiceOrb compact={panel} mode={mode} />
          <span
            aria-hidden
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-medium tracking-wide text-violet-100 backdrop-blur"
          >
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                  mode === "speaking" ? "bg-fuchsia-300" : "bg-emerald-300"
                }`}
              />
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  mode === "speaking" ? "bg-fuchsia-300" : "bg-emerald-300"
                }`}
              />
            </span>
            <span key={mode} className="animate-rise">
              {mode === "speaking" ? "Emily está hablando" : "Emily te escucha"}
            </span>
          </span>
          {feed.length ? (
            <BubbleTrail feed={feed} />
          ) : (
            <p
              key={caption}
              className="animate-rise max-w-[16rem] text-center text-sm text-balance text-violet-200"
            >
              {caption}
            </p>
          )}
        </div>
      </aside>

      {/* Content */}
      <section
        ref={rightRef}
        className={`flex min-h-dvh min-w-0 flex-col px-6 py-6 md:px-10 xl:px-14 ${
          wide ? "md:ml-[var(--panel)]" : "md:ml-[50%]"
        }`}
      >
        <nav className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="font-semibold">Emily</span>
          {wide && (
            <div
              role="tablist"
              aria-label="Secciones"
              className="bg-accent-soft/60 inline-flex rounded-full p-1"
            >
              {(
                [
                  ["crear", "Crear Emily", 0],
                  ["emilys", "Mis Emilys", saved.emilys.length],
                  ["resultados", "Resultados", saved.results.length],
                ] as const
              ).map(([id, label, count]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={section === id}
                  onClick={() => go(id)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 transition-[background-color,color] duration-200 ease-out ${
                    section === id
                      ? "bg-card text-accent font-medium shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {label}
                  {count > 0 && (
                    <span
                      className={`rounded-full px-1.5 text-xs tabular-nums ${
                        section === id ? "bg-accent text-accent-foreground" : "bg-border"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </nav>

        <div
          key={wide ? section : "hero"}
          className={`flex flex-1 flex-col transition-[opacity,translate] duration-200 ease-out ${
            exiting
              ? "-translate-y-1.5 opacity-0 motion-reduce:translate-y-0"
              : wide
                ? fromHero
                  ? "animate-slide-in [animation-delay:280ms]"
                  : "animate-rise"
                : ""
          }`}
        >
          {section === "emilys" ? (
            <EmilyList
              emilys={saved.emilys}
              results={saved.results}
              onMode={setVoiceMode}
              onFeed={setFeed}
              onCreate={() => go("crear")}
            />
          ) : section === "resultados" ? (
            <ResultsList results={saved.results} onCreate={() => go("emilys")} />
          ) : !open ? (
            <div className="my-auto max-w-xl space-y-10 py-16">
              <div className="space-y-6">
                <h1 className="animate-rise text-5xl leading-[1.02] font-semibold tracking-[-0.035em] text-balance md:text-6xl lg:text-7xl">
                  Hola, soy Emily.
                </h1>
                <p
                  className="animate-rise text-muted max-w-[52ch] text-lg leading-relaxed"
                  style={{ animationDelay: "60ms" }}
                >
                  Entrevisto a tus clientes por voz, en español o inglés, a través de un simple
                  link. Me mantengo en tu objetivo y te entrego lo que descubrí.
                </p>
              </div>

              <ul className="space-y-5">
                {proofs.map(({ Icon, title, body }, i) => (
                  <li
                    key={title}
                    className="animate-rise flex gap-4"
                    style={{ animationDelay: `${180 + i * 60}ms` }}
                  >
                    <span className="bg-accent-soft text-accent grid h-10 w-10 shrink-0 place-items-center rounded-full">
                      <Icon />
                    </span>
                    <span>
                      <span className="block font-medium">{title}</span>
                      <span className="text-muted text-sm">{body}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <div
                className="animate-rise flex flex-wrap items-center gap-4"
                style={{ animationDelay: "420ms" }}
              >
                <button className={`${primary} px-8 py-4 text-base`} onClick={openConfig}>
                  Configura Emily <ArrowRight className="h-5 w-5" />
                </button>
                <Link
                  href="/demo/entrevista"
                  target="_blank"
                  className="text-accent text-sm font-medium hover:underline"
                >
                  Escucha una entrevista de ejemplo
                </Link>
              </div>
            </div>
          ) : (
            <div className="w-full py-8">
              {created ? (
                <Result
                  c={created}
                  onMode={setVoiceMode}
                  onFeed={setFeed}
                  onDone={() =>
                    swap(true, () => {
                      setVoiceMode(null);
                      setFeed([]);
                      setCreated(null); // next "Crear Emily" starts a fresh form
                      setSection("emilys");
                    })
                  }
                />
              ) : (
                <ConfigureForm
                  onVoiceMode={setVoiceMode}
                  onFeed={setFeed}
                  onCreate={(c) => {
                    setVoiceMode(null);
                    setFeed([]);
                    setCreated(c);
                    toTop();
                  }}
                  onClose={closeConfig}
                />
              )}
            </div>
          )}
        </div>

        <footer className="text-muted mt-auto pt-6 text-xs">
          © {new Date().getFullYear()} NEOera Systems
        </footer>
      </section>
    </div>
  );
}

type Section = "crear" | "emilys" | "resultados";
type Q = { id: number; text: string; kind: QuestionKind };
type Assist = "voice" | "preset" | null;

function ConfigureForm({
  onCreate,
  onClose,
  onVoiceMode,
  onFeed,
}: {
  onCreate: (c: Created) => void;
  onClose: () => void;
  onVoiceMode: (m: OrbMode | null) => void;
  onFeed: (m: Msg[]) => void;
}) {
  const [d, setD] = useState<Omit<Draft, "questions">>({
    recipientName: "",
    company: "",
    project: "",
    objective: "",
    areas: [],
    locale: "es",
    status: "active",
    expires: "",
    noExpiry: false,
    voice: "coral",
    reportEmail: "",
  });
  const [questions, setQuestions] = useState<Q[]>([{ id: 0, text: "", kind: "abierta" }]);
  const [refining, setRefining] = useState(false);
  const [refineNote, setRefineNote] = useState("");
  const [areaDraft, setAreaDraft] = useState("");
  const [assist, setAssist] = useState<Assist>(null);
  const [status, setStatus] = useState({ voice: false, llm: false });
  const [flash, setFlash] = useState(0); // bumps when AI fills fields → brief highlight
  const nextId = useRef(1);

  useEffect(() => {
    aiStatus()
      .then(setStatus)
      .catch(() => {});
  }, []);

  const filled = questions.filter((q) => q.text.trim());
  const draft: Draft = { ...d, questions: filled.map(({ text, kind }) => ({ text, kind })) };
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));

  const applyPatch = useCallback((p: Patch) => {
    const { questions: qs, ...rest } = p;
    setD((x) => ({ ...x, ...rest }));
    if (qs?.length) setQuestions(toQuestions(qs).map((q) => ({ id: nextId.current++, ...q })));
    setFlash((n) => n + 1);
  }, []);

  // Write the questions once the objective is clear, or improve existing ones with new context.
  async function refine(auto = false) {
    if (refining || draft.objective.trim().length < 10) return;
    setRefining(true);
    setRefineNote("");
    try {
      const r = await refineQuestions(draft);
      if (r.questions?.length) applyPatch({ questions: r.questions });
      setRefineNote(auto ? `Emily propuso preguntas a partir del objetivo. ${r.note}` : r.note);
    } catch (err) {
      if (!auto) setRefineNote(err instanceof Error ? err.message : "No pude generar preguntas.");
    } finally {
      setRefining(false);
    }
  }

  function addArea() {
    const a = areaDraft.trim();
    if (a && !d.areas.includes(a)) set("areas", [...d.areas, a]);
    setAreaDraft("");
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const copy = [...questions];
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    setQuestions(copy);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (missingFields(draft).length) return;
    const fmt =
      d.expires && new Date(`${d.expires}T23:59`).toLocaleDateString("es", { dateStyle: "long" });
    const slug = uniqueSlug(toSlug(d.project) || "entrevista");
    saveEmily(slug, draft);
    onCreate({
      slug,
      url: `${DOMAIN}/${slug}`,
      project: d.project,
      recipient: [d.recipientName, d.company].filter(Boolean).join(" · ") || "Link abierto",
      questions: filled.length,
      areas: d.areas.length,
      locale: d.locale,
      status: `${d.status === "active" ? "Activo" : "Pausado"} · ${
        d.noExpiry || !fmt ? "sin caducidad" : `caduca el ${fmt}`
      }`,
      draft,
    });
  }

  const hl = flash ? "animate-fill-flash" : "";

  if (assist === "voice")
    return (
      <VoiceSetup
        draft={draft}
        openai={status.voice}
        onPatch={applyPatch}
        onMode={onVoiceMode}
        onFeed={onFeed}
        onFinish={() => {
          onVoiceMode(null);
          onFeed([]);
          setAssist(null);
          setFlash((n) => n + 1);
        }}
      />
    );

  return (
    <form onSubmit={submit} className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] md:text-4xl">Configura Emily</h2>
          <p className="text-muted">
            Llénalo tú, díctaselo a Emily o parte de una plantilla.{" "}
            <span className="text-xs">
              {status.llm ? "· IA conectada" : "· Modo demo: IA local, sin clave de OpenAI"}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar configuración"
          className="text-muted hover:bg-accent-soft hover:text-accent grid h-10 w-10 place-items-center rounded-full transition"
        >
          <XIcon />
        </button>
      </header>

      {/* Two assisted ways in */}
      <div className="grid gap-3 lg:grid-cols-2">
        <AssistCard
          active={false}
          onClick={() => setAssist("voice")}
          Icon={MicIcon}
          title="Configurar por voz"
          body="Cuéntale a Emily qué necesitas y ella llena todos los campos."
        />
        <AssistCard
          active={assist === "preset"}
          onClick={() => setAssist(assist === "preset" ? null : "preset")}
          Icon={SparkIcon}
          title="Usar una plantilla"
          body="Elige un tipo de entrevista y la IA genera las preguntas para tu caso."
        />
      </div>

      {assist === "preset" && (
        <PresetPicker
          locale={d.locale}
          onPatch={(p) => {
            applyPatch(p);
            setAssist(null);
          }}
        />
      )}

      <div key={flash} className="grid gap-x-12 gap-y-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-7">
          <Field label="Destinatario" hint="Quién recibirá a Emily. Vacío = link abierto.">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className={`${field} ${hl}`}
                placeholder="Nombre"
                aria-label="Nombre del destinatario"
                autoComplete="off"
                value={d.recipientName}
                onChange={(e) => set("recipientName", e.target.value)}
              />
              <input
                className={`${field} ${hl}`}
                placeholder="Empresa"
                aria-label="Empresa del destinatario"
                autoComplete="off"
                value={d.company}
                onChange={(e) => set("company", e.target.value)}
              />
            </div>
          </Field>

          <Field label="Proyecto u oportunidad" htmlFor="project">
            <input
              id="project"
              className={`${field} ${hl}`}
              required
              placeholder="Tienda online para Boutique Luna"
              value={d.project}
              onChange={(e) => set("project", e.target.value)}
            />
            <p className="text-muted mt-2 font-mono text-xs">
              {DOMAIN}/<span className="text-accent">{toSlug(d.project) || "tu-proyecto"}</span>
            </p>
          </Field>

          <Field
            label="Objetivo de la entrevista"
            htmlFor="objective"
            hint="Emily lo usa para no perder el foco."
          >
            <textarea
              id="objective"
              className={`${field} resize-y leading-relaxed ${hl}`}
              required
              minLength={10}
              rows={3}
              placeholder="Entender si están listos para vender por internet y qué les frena."
              value={d.objective}
              onChange={(e) => set("objective", e.target.value)}
              onBlur={() => {
                if (status.llm && !filled.length && d.objective.trim().length >= 25)
                  void refine(true);
              }}
            />
          </Field>

          <div className="grid gap-7 sm:grid-cols-2">
            <Field label="Idioma preferido">
              <Segmented
                label="Idioma preferido"
                value={d.locale}
                onChange={(v) => set("locale", v)}
                options={[
                  ["es", "Español"],
                  ["en", "English"],
                ]}
              />
            </Field>
            <Field label="Estado del enlace">
              <Segmented
                label="Estado del enlace"
                value={d.status}
                onChange={(v) => set("status", v)}
                options={[
                  ["active", "Activo"],
                  ["paused", "Pausado"],
                ]}
              />
            </Field>
          </div>

          <Field label="Voz de Emily" hint="Toca ▶ para escucharla.">
            <VoicePicker value={d.voice} locale={d.locale} onChange={(v) => set("voice", v)} />
          </Field>

          <Field
            label="Enviar resultados a"
            htmlFor="reportEmail"
            hint="Al terminar cada entrevista, Emily envía aquí el resumen ordenado por correo."
          >
            <input
              id="reportEmail"
              type="email"
              autoComplete="email"
              className={`${field} ${hl}`}
              placeholder="tu-correo@empresa.com"
              value={d.reportEmail}
              onChange={(e) => set("reportEmail", e.target.value.trim())}
            />
          </Field>

          <Field label="Caducidad" htmlFor="expires">
            <div className="flex flex-wrap items-center gap-4">
              <input
                id="expires"
                type="date"
                className={`${field} w-auto ${hl}`}
                value={d.expires}
                disabled={d.noExpiry}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => set("expires", e.target.value)}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={d.noExpiry}
                  onChange={(e) => set("noExpiry", e.target.checked)}
                />
                Sin caducidad
              </label>
            </div>
          </Field>
        </div>

        <div className="space-y-7">
          <Field
            label="Preguntas o información obligatoria"
            hint="Emily se asegura de cubrir cada una. Toca Abierta/Cerrada para cambiar el tipo."
          >
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={quiet}
                disabled={refining || d.objective.trim().length < 10}
                onClick={() => void refine()}
                title={d.objective.trim().length < 10 ? "Primero escribe el objetivo" : undefined}
              >
                {refining ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <SparkIcon className="h-4 w-4" />
                )}
                {refining
                  ? "Pensando preguntas…"
                  : filled.length
                    ? "Mejorar preguntas con IA"
                    : "Formular preguntas con IA"}
              </button>
              {refineNote && (
                <p className="text-muted text-sm transition-opacity duration-200 starting:opacity-0">
                  {refineNote}
                </p>
              )}
            </div>
            <ol className="space-y-2">
              {questions.map((q, i) => (
                <li
                  key={q.id}
                  className="group flex items-center gap-2 transition-[opacity,translate] duration-200 ease-out starting:-translate-y-1 starting:opacity-0"
                >
                  <span className="text-muted w-5 text-right text-sm tabular-nums">{i + 1}</span>
                  <input
                    className={`${field} ${hl}`}
                    placeholder="¿Tienen sitio web?"
                    aria-label={`Pregunta ${i + 1}`}
                    value={q.text}
                    onChange={(e) =>
                      setQuestions((qs) =>
                        qs.map((x) => (x.id === q.id ? { ...x, text: e.target.value } : x)),
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setQuestions((qs) =>
                        qs.map((x) =>
                          x.id === q.id
                            ? { ...x, kind: x.kind === "abierta" ? "cerrada" : "abierta" }
                            : x,
                        ),
                      )
                    }
                    aria-label={`Pregunta ${i + 1}: ${q.kind}. Cambiar tipo`}
                    className={`w-20 shrink-0 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                      q.kind === "abierta"
                        ? "bg-accent-soft text-accent"
                        : "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                    }`}
                  >
                    {q.kind === "abierta" ? "Abierta" : "Cerrada"}
                  </button>
                  <span className="flex shrink-0 opacity-60 transition group-focus-within:opacity-100 group-hover:opacity-100">
                    <IconBtn
                      label={`Subir pregunta ${i + 1}`}
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn
                      label={`Bajar pregunta ${i + 1}`}
                      onClick={() => move(i, 1)}
                      disabled={i === questions.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn
                      label={`Quitar pregunta ${i + 1}`}
                      onClick={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))}
                    >
                      <XIcon className="h-4 w-4" />
                    </IconBtn>
                  </span>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() =>
                setQuestions((qs) => [...qs, { id: nextId.current++, text: "", kind: "abierta" }])
              }
              className="text-accent mt-3 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
            >
              <PlusIcon className="h-4 w-4" /> Agregar pregunta
            </button>
          </Field>

          <Field
            label="Áreas de seguimiento opcionales"
            htmlFor="area"
            hint="Temas que Emily explora si surge la oportunidad. Enter para agregar."
          >
            <div className="flex gap-2">
              <input
                id="area"
                className={field}
                placeholder="Presupuesto, competencia, equipo…"
                value={areaDraft}
                onChange={(e) => setAreaDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addArea();
                  }
                }}
              />
              <button
                type="button"
                onClick={addArea}
                className={quiet}
                disabled={!areaDraft.trim()}
              >
                Agregar
              </button>
            </div>
            {d.areas.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {d.areas.map((a) => (
                  <li
                    key={a}
                    className="bg-accent-soft text-accent flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm font-medium transition-[opacity,scale] duration-200 ease-out starting:scale-95 starting:opacity-0"
                  >
                    {a}
                    <button
                      type="button"
                      aria-label={`Quitar ${a}`}
                      onClick={() =>
                        set(
                          "areas",
                          d.areas.filter((x) => x !== a),
                        )
                      }
                      className="hover:bg-accent/15 grid h-6 w-6 place-items-center rounded-full"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Field>
        </div>
      </div>

      <div className="border-border bg-background/85 sticky bottom-0 -mx-2 flex flex-wrap items-center justify-between gap-4 border-t px-2 py-5 backdrop-blur">
        <p className="text-muted text-sm tabular-nums">
          {filled.length} {filled.length === 1 ? "pregunta" : "preguntas"} · {d.areas.length}{" "}
          {d.areas.length === 1 ? "área" : "áreas"} · {d.locale === "es" ? "Español" : "English"}
          {missingFields(draft).length > 0 && ` · falta ${missingFields(draft).join(", ")}`}
        </p>
        <button className={primary} disabled={missingFields(draft).length > 0}>
          Crear Emily <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

function AssistCard({
  active,
  onClick,
  Icon,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  Icon: (p: { className?: string }) => React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition-[border-color,background-color,scale] duration-200 ease-out active:scale-[0.99] ${
        active ? "border-accent bg-accent-soft/60" : "border-border bg-card hover:border-accent/40"
      }`}
    >
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors ${
          active ? "bg-accent text-accent-foreground" : "bg-accent-soft text-accent"
        }`}
      >
        <Icon />
      </span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="text-muted text-sm">{body}</span>
      </span>
    </button>
  );
}

const GREETING =
  "Hola, te ayudo a configurarme. Cuéntame con quién voy a hablar, para qué proyecto y qué quieres descubrir.";

/**
 * Voice mode: only the conversation. Emily talks, listens hands-free (stops on silence), and
 * each answer fills the form behind the scenes. "Terminar" returns to the filled fields.
 */
function VoiceSetup({
  draft,
  openai,
  onPatch,
  onMode,
  onFeed,
  onFinish,
}: {
  draft: Draft;
  openai: boolean;
  onPatch: (p: Patch) => void;
  onMode: (m: OrbMode | null) => void;
  onFeed: (m: Msg[]) => void;
  onFinish: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([{ from: "emily", text: GREETING }]);
  const [typed, setTyped] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const voice = useEmilyVoice({ openai, locale: draft.locale, voice: draft.voice, onMode });
  const draftRef = useRef(draft);
  const alive = useRef(true);
  const typing = useRef(false); // a typed answer interrupted the recording: don't treat as silence
  const started = useRef(false);
  const listEnd = useRef<HTMLLIElement>(null);

  useEffect(() => {
    draftRef.current = draft;
  });
  useEffect(() => {
    onFeed(msgs);
    listEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msgs, onFeed]);

  // Greet, then listen. Guarded so dev StrictMode's double effect doesn't greet twice.
  useEffect(() => {
    alive.current = true;
    if (!started.current) {
      started.current = true;
      voice.unlock();
      voice.say(GREETING).then(() => void listenTurn());
    }
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on open
  }, []);

  async function listenTurn() {
    if (!alive.current) return;
    setError("");
    try {
      const text = await voice.listen();
      if (!alive.current) return;
      if (typing.current) return void (typing.current = false);
      if (!text) {
        await voice.say("No te escuché bien, ¿me lo repites?");
        return listenTurn();
      }
      await handle(text);
    } catch (err) {
      setError(micError(err));
      onMode("listening");
    }
  }

  async function handle(text: string) {
    setMsgs((m) => [...m, { from: "you", text }]);
    setThinking(true);
    try {
      const { patch, reply } = await fillFromSpeech(text, draftRef.current);
      if (!alive.current) return;
      onPatch(patch);
      const complete = missingFields({ ...draftRef.current, ...patch } as Draft).length === 0;
      const line = complete ? `${reply} Cuando quieras, pulsa Terminar para revisar.` : reply;
      setMsgs((m) => [...m, { from: "emily", text: line }]);
      setThinking(false);
      await voice.say(line);
      if (!complete) await listenTurn();
    } catch (err) {
      setThinking(false);
      setError(err instanceof Error ? err.message : "Algo falló, intenta de nuevo.");
    }
  }

  function sendTyped() {
    const text = typed.trim();
    if (!text) return;
    typing.current = voice.state === "recording";
    voice.cancel();
    setTyped("");
    void handle(text);
  }

  const d = draft;
  const captured = [
    [d.recipientName || d.company ? "Destinatario" : "", !!(d.recipientName || d.company)],
    ["Proyecto", !!d.project.trim()],
    ["Objetivo", d.objective.trim().length >= 10],
    [`${d.questions.length} preguntas`, d.questions.length > 0],
    [d.areas.length ? `${d.areas.length} áreas` : "", d.areas.length > 0],
    [d.expires ? "Caducidad" : "", !!d.expires],
    [d.reportEmail ? "Correo de resultados" : "", !!d.reportEmail],
  ].filter(([label]) => label) as [string, boolean][];

  const recording = voice.state === "recording";
  const busy = thinking || voice.state === "transcribing";
  const statusLine = recording
    ? "Te escucho… habla con naturalidad, envío cuando hagas una pausa."
    : voice.state === "transcribing"
      ? "Entendiendo lo que dijiste…"
      : thinking
        ? "Llenando los campos…"
        : voice.state === "speaking"
          ? "Emily está hablando…"
          : "";

  return (
    <section aria-label="Configurar por voz" className="flex min-h-[70dvh] flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-semibold tracking-[-0.03em]">Configura Emily por voz</h2>
          <p className="text-muted text-sm">
            {openai ? "Voz y escucha con OpenAI" : "Voz del navegador (sin clave de OpenAI)"} ·
            puedes hablar o escribir.
          </p>
        </div>
        <button
          type="button"
          className={primary}
          onClick={() => {
            alive.current = false;
            voice.cancel();
            onFinish();
          }}
        >
          <CheckIcon className="h-4 w-4" /> Terminar
        </button>
      </header>

      {captured.length > 0 && (
        <ul aria-label="Lo que Emily ya anotó" className="flex flex-wrap gap-2">
          {captured.map(([label, ok]) => (
            <li
              key={label}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-[opacity,scale] duration-200 ease-out starting:scale-95 starting:opacity-0 ${
                ok ? "bg-accent-soft text-accent" : "bg-border/60 text-muted"
              }`}
            >
              {ok && <CheckIcon className="h-3.5 w-3.5" />} {label}
            </li>
          ))}
        </ul>
      )}

      <ol
        aria-live="polite"
        className="border-border bg-card flex-1 space-y-3 overflow-y-auto rounded-2xl border p-5"
      >
        {msgs.map((m, i) => (
          <li
            key={i}
            className={`flex transition-[opacity,translate] duration-200 ease-out starting:translate-y-1 starting:opacity-0 ${
              m.from === "you" ? "justify-end" : ""
            }`}
          >
            <p
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 leading-relaxed ${
                m.from === "emily"
                  ? "bg-accent-soft/70 rounded-tl-sm"
                  : "bg-accent text-accent-foreground rounded-tr-sm"
              }`}
            >
              {m.text}
            </p>
          </li>
        ))}
        {recording && voice.interim && (
          <li className="flex justify-end">
            <p className="border-accent/40 text-muted max-w-[80%] rounded-2xl border border-dashed px-4 py-2.5">
              {voice.interim}
            </p>
          </li>
        )}
        <li ref={listEnd} aria-hidden />
      </ol>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="space-y-2">
        <p className="text-muted flex h-5 items-center gap-2 text-sm">
          {(busy || recording) && (
            <span
              className={`h-2 w-2 rounded-full ${recording ? "animate-pulse bg-red-500" : "bg-accent animate-pulse"}`}
            />
          )}
          {statusLine}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={recording ? voice.stop : () => void listenTurn()}
            disabled={busy || voice.state === "speaking"}
            aria-label={recording ? "Ya terminé de hablar" : "Hablar"}
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-white shadow-lg transition-[scale,background-color] duration-160 ease-out active:scale-[0.95] disabled:opacity-40 ${
              recording ? "bg-red-500" : "bg-accent"
            }`}
          >
            {recording ? <StopIcon /> : <MicIcon />}
          </button>
          <input
            className={field}
            placeholder="…o escribe tu respuesta y pulsa Enter"
            value={typed}
            disabled={busy}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                sendTyped();
              }
            }}
          />
          <IconBtn
            label="Enviar respuesta escrita"
            disabled={!typed.trim() || busy}
            onClick={sendTyped}
          >
            <SendIcon className="h-4 w-4" />
          </IconBtn>
        </div>
      </div>
    </section>
  );
}

/** Predefined configurations: pick a type, name the business, the AI writes the rest. */
function PresetPicker({ locale, onPatch }: { locale: "es" | "en"; onPatch: (p: Patch) => void }) {
  const [chosen, setChosen] = useState<PresetId>("negocio");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const preset = presets.find((p) => p.id === chosen)!;

  async function generate() {
    setLoading(true);
    setError("");
    try {
      onPatch((await generateFromPreset(chosen, context, locale)).patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude generar la configuración.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      aria-label="Plantillas"
      className="border-accent/30 bg-card animate-reveal space-y-5 rounded-2xl border p-5"
    >
      <div
        role="radiogroup"
        aria-label="Tipo de entrevista"
        className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-5"
      >
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={chosen === p.id}
            onClick={() => setChosen(p.id)}
            className={`rounded-xl border p-3 text-left transition-[border-color,background-color] duration-200 ease-out ${
              chosen === p.id
                ? "border-accent bg-accent-soft/60"
                : "border-border hover:border-accent/40"
            }`}
          >
            <span className="block text-sm font-medium">{p.label}</span>
            <span className="text-muted mt-0.5 block text-xs">{p.desc}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-64 flex-1 space-y-1.5">
          <span className="text-sm font-medium">{preset.context}</span>
          <input
            className={field}
            placeholder={preset.placeholder}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                generate();
              }
            }}
          />
        </label>
        <button type="button" className={primary} onClick={generate} disabled={loading}>
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <SparkIcon className="h-4 w-4" />
          )}
          {loading ? "Generando…" : "Generar con IA"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}

function Result({
  c,
  onMode,
  onFeed,
  onDone,
}: {
  c: Created;
  /** "Terminar y salir": closes the setup and opens Mis Emilys. */
  onDone: () => void;
  onMode: (m: OrbMode | null) => void;
  onFeed: (m: Msg[]) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const path = `/e/${c.slug}`;

  if (testing)
    return (
      <InterviewLive
        draft={c.draft}
        slug={c.slug}
        onMode={onMode}
        onFeed={onFeed}
        onExit={() => {
          onMode(null);
          onFeed([]);
          setTesting(false);
        }}
      />
    );

  const voice = voices.find((v) => v.id === c.draft.voice);
  const facts = [
    ["Para", c.recipient],
    ["Preguntas", String(c.questions)],
    ["Áreas de seguimiento", String(c.areas)],
    ["Idioma", c.locale === "es" ? "Español" : "English"],
    ["Voz", voice ? `${voice.name} · ${voice.desc}` : "—"],
    ["Resultados por correo a", c.draft.reportEmail || "Solo en Resultados"],
    ["Enlace", c.status],
  ];
  return (
    <div className="grid gap-12 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="max-w-2xl space-y-8">
        <div className="space-y-3">
          <p className="text-accent inline-flex items-center gap-2 font-medium">
            <CheckIcon className="h-5 w-5" /> Emily está lista
          </p>
          <h2 className="text-4xl font-semibold tracking-[-0.03em] text-balance">{c.project}</h2>
          <p className="text-muted">{c.draft.objective}</p>
        </div>

        <div className="space-y-2">
          <div className="border-border bg-card flex items-center gap-2 rounded-full border p-1.5 pl-5 shadow-sm">
            <code className="min-w-0 flex-1 truncate text-sm">
              {window.location.origin}
              {path}
            </code>
            <button
              className={quiet}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.origin + path);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  /* clipboard blocked — URL is visible */
                }
              }}
            >
              {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <p className="text-muted text-xs">
            Con dominio propio será <span className="font-mono">{c.url}</span>. Por ahora el link
            abre en este navegador (aún no hay base de datos).
          </p>
        </div>

        <dl className="divide-border border-border divide-y border-y">
          {facts.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-6 py-3 text-sm">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap gap-3">
          <button className={primary} onClick={() => setTesting(true)}>
            <MicIcon className="h-4 w-4" /> Probar aquí por voz
          </button>
          <Link href={path} target="_blank" className={quiet}>
            Ver como participante <ArrowRight className="h-4 w-4" />
          </Link>
          <button className={quiet} onClick={onDone}>
            <CheckIcon className="h-4 w-4" /> Terminar y salir
          </button>
        </div>
      </div>

      <section aria-label="Preguntas" className="space-y-4">
        <h3 className="font-medium">Lo que Emily va a preguntar</h3>
        <ol className="space-y-2">
          {c.draft.questions.map((q, i) => (
            <li
              key={i}
              className="border-border bg-card flex items-start gap-3 rounded-xl border px-4 py-3"
            >
              <span className="text-accent w-5 shrink-0 text-sm font-medium tabular-nums">
                {i + 1}
              </span>
              <span className="flex-1 text-sm leading-relaxed">{q.text}</span>
              <KindTag kind={q.kind} />
            </li>
          ))}
        </ol>
        {c.draft.areas.length > 0 && (
          <p className="text-muted text-sm">Si surge, profundiza en: {c.draft.areas.join(", ")}.</p>
        )}
      </section>
    </div>
  );
}

function KindTag({ kind }: { kind: QuestionKind }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
        kind === "abierta"
          ? "bg-accent-soft text-accent"
          : "bg-sky-500/15 text-sky-700 dark:text-sky-300"
      }`}
    >
      {kind === "abierta" ? "Abierta" : "Cerrada"}
    </span>
  );
}

const SAMPLE = {
  es: "Hola, soy Emily. Así sonará mi voz en tus entrevistas.",
  en: "Hi, I'm Emily. This is how I'll sound in your interviews.",
};

/** OpenAI voices with a ▶ preview (browser voice when there is no key). */
function VoicePicker({
  value,
  locale,
  onChange,
}: {
  value: VoiceId;
  locale: "es" | "en";
  onChange: (v: VoiceId) => void;
}) {
  const [playing, setPlaying] = useState<VoiceId | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  async function preview(v: VoiceId) {
    audio.current?.pause();
    setPlaying(v);
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: SAMPLE[locale], language: locale, voice: v }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = new Audio(url);
      audio.current = a;
      a.onended = a.onerror = () => {
        URL.revokeObjectURL(url);
        setPlaying(null);
      };
      await a.play();
    } catch (err) {
      // Only without an OpenAI key (503) does the preview fall back to the browser voice.
      if (!(err instanceof Error && err.message === "503")) return setPlaying(null);
      const u = new SpeechSynthesisUtterance(SAMPLE[locale]);
      u.lang = locale === "es" ? "es-MX" : "en-US";
      u.onend = () => setPlaying(null);
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Voz de Emily"
      className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3"
    >
      {voices.map((v) => {
        const on = value === v.id;
        return (
          <div
            key={v.id}
            role="radio"
            aria-checked={on}
            tabIndex={0}
            onClick={() => onChange(v.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onChange(v.id)}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-[border-color,background-color] duration-200 ease-out ${
              on ? "border-accent bg-accent-soft/60" : "border-border hover:border-accent/40"
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{v.name}</span>
              <span className="text-muted block truncate text-xs">{v.desc}</span>
            </span>
            <button
              type="button"
              aria-label={`Escuchar la voz ${v.name}`}
              onClick={(e) => {
                e.stopPropagation();
                void preview(v.id);
              }}
              className="border-border hover:border-accent/40 hover:text-accent grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs transition-colors"
            >
              {playing === v.id ? (
                <span className="bg-accent h-2 w-2 animate-pulse rounded-full" />
              ) : (
                <PlayIcon className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div>
        <label htmlFor={htmlFor} className="font-medium">
          {label}
        </label>
        {hint && <p className="text-muted text-sm">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="bg-accent-soft/60 inline-flex rounded-full p-1"
    >
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`rounded-full px-5 py-2 text-sm transition ${
            value === v
              ? "bg-card text-accent font-medium shadow-sm"
              : "text-muted hover:text-foreground"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
