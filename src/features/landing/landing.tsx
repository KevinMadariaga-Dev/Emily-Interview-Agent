"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  aiStatus,
  fillFromSpeech,
  generateBranching,
  generateFromPreset,
  refineQuestions,
  translateDraft,
} from "./ai";
import {
  LINK_BASE,
  answerKind,
  missingFields,
  presets,
  toQuestions,
  voices,
  type Draft,
  type Patch,
  type PresetId,
  type Question,
  type QuestionKind,
  type VoiceId,
  toSlug,
} from "./config";
import { dict, LangProvider, useLang, type Lang, type Strings } from "./i18n";
import { saveLangCookie } from "./lang-cookie";
import { InterviewLive } from "./interview-live";
import {
  ArrowRight,
  CheckIcon,
  CopyIcon,
  InboxIcon,
  LinkIcon,
  MicIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SendIcon,
  SparkIcon,
  StopIcon,
  XIcon,
} from "./icons";
import {
  BubbleTrail,
  field,
  friendlyError,
  micError,
  primary,
  quiet,
  type Msg,
} from "./ui";
import { BranchesView, emptyQuestion, prune, QuestionTree } from "./question-editor";
import { EmilyList, ResultsList } from "./saved-views";
import { saveEmily, useSavedEmilys } from "./store";
import { useEmilyVoice } from "./use-emily-voice";
import { useSetupRealtime } from "./use-setup-realtime";
import { VoiceOrb, type OrbMode } from "./voice-orb";

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

// Hero proof points: icons here, words in i18n (proofs[i]).
const proofs = [{ Icon: LinkIcon }, { Icon: MicIcon }, { Icon: InboxIcon }];

/** Home. Closed: violet field with Emily + pitch. Open: field pinned left, setup on the right. */
export function Landing({ initialLang = "es" }: { initialLang?: Lang }) {
  // Starts in the language the server read from the cookie: no flash on reload.
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    saveLangCookie(l); // remembered for the next visit (only when the user picks)
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const t = dict[lang];
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
  const langHandler = useRef<((l: Lang) => void) | null>(null); // the open form's ES/EN switch

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
    ? t.tagline
    : section === "emilys"
      ? t.captionEmilys
      : section === "resultados"
        ? t.captionResults
        : created
          ? t.captionCreated
          : voiceMode
            ? t.captionVoice
            : t.captionForm;

  return (
    <LangProvider value={{ lang, setLang }}>
      <div lang={lang} className="relative min-h-dvh md:[--panel:18rem] xl:[--panel:22rem]">
        {/* Violet field: Emily lives here. Fixed half-screen layer; "narrowing" is a clip-path, so
          nothing reflows while it moves. Emily's group slides with a transform to stay centered. */}
        <aside
          className={`bg-accent-deep relative flex-col overflow-hidden px-6 py-6 text-white md:px-8 md:py-8 motion-reduce:transition-none ${
            // Phones: Emily's big panel only on the home screen; setup/lists get the whole screen.
            wide ? "hidden md:flex" : "flex"
          } md:fixed md:inset-y-0 md:left-0 md:z-10 md:w-1/2 md:transition-[clip-path] md:duration-500 md:ease-in-out ${
            panel
              ? "md:[clip-path:inset(0_calc(100%_-_var(--panel))_0_0)]"
              : "md:delay-100 md:[clip-path:inset(0)]"
          }`}
        >
          <p className="text-sm font-semibold tracking-[0.3em] uppercase">
            NEO<span className="text-violet-300">era</span>
          </p>
          <div
            className={`flex flex-1 flex-col items-center justify-center gap-4 py-4 md:gap-6 md:py-8 motion-reduce:transition-none md:transition-[translate] md:duration-500 md:ease-in-out ${
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
                {mode === "speaking" ? t.speaking : t.listening}
              </span>
            </span>
            {feed.length ? (
              <BubbleTrail feed={feed} label={t.convTitle(feed.length)} />
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
          className={`flex min-h-dvh min-w-0 flex-col overflow-x-clip px-4 py-6 sm:px-6 md:px-10 xl:px-14 ${
            wide ? "md:ml-[var(--panel)]" : "md:ml-[50%]"
          }`}
        >
          {/* Same three slots in every section (brand · tabs · ES/EN): nothing shifts when switching */}
          <nav className="flex flex-wrap items-center justify-between gap-3 text-sm lg:grid lg:grid-cols-[1fr_auto_1fr]">
            <span className="font-semibold">Emily</span>
            {wide && (
              <div
                role="tablist"
                aria-label={t.sections}
                // Phones/tablets: own full-width row under brand · ES/EN, three equal tabs.
                className="bg-accent-soft/60 order-last grid w-full grid-cols-3 rounded-full p-1 lg:order-none lg:inline-flex lg:w-auto lg:justify-self-center"
              >
                {(
                  [
                    ["crear", t.tabs.crear, 0],
                    ["emilys", t.tabs.emilys, saved.emilys.length],
                    ["resultados", t.tabs.resultados, saved.results.length],
                  ] as const
                ).map(([id, label, count]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={section === id}
                    onClick={() => go(id)}
                    className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full px-1.5 py-2 text-xs whitespace-nowrap transition-[background-color,color] duration-200 ease-out min-[360px]:px-2 min-[360px]:text-sm sm:gap-2 sm:px-4 ${
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
            {!wide && <span aria-hidden className="hidden lg:block" />}
            {/* ES/EN on every screen, home included */}
            <div className="lg:justify-self-end">
              <Segmented
                label={t.language}
                value={lang}
                // In "Crear" the form also switches Emily's language and translates the draft.
                onChange={(l) =>
                  section === "crear" && langHandler.current ? langHandler.current(l) : setLang(l)
                }
                options={[
                  ["es", "ES"],
                  ["en", "EN"],
                ]}
                compact
              />
            </div>
          </nav>

          <div
            key={wide ? section : "hero"}
            className={`flex flex-1 flex-col transition-[opacity,translate] duration-200 ease-out ${
              exiting
                ? fromHero
                  ? "-translate-y-1.5 opacity-0 motion-reduce:translate-y-0"
                  : "opacity-0" // tab switch: fade only, nothing moves
                : wide
                  ? fromHero
                    ? "animate-slide-in [animation-delay:280ms]"
                    : "animate-fade"
                  : ""
            }`}
          >
            {section !== "crear" && !saved.ready ? (
              <p className="text-muted my-auto py-16 text-sm">…</p>
            ) : section === "emilys" ? (
              <EmilyList
                emilys={saved.emilys}
                results={saved.results}
                error={saved.error}
                onMode={setVoiceMode}
                onFeed={setFeed}
                onCreate={() => go("crear")}
              />
            ) : section === "resultados" ? (
              <ResultsList
                results={saved.results}
                emilys={saved.emilys}
                onCreate={() => go("emilys")}
              />
            ) : !open ? (
              <div className="my-auto max-w-xl space-y-8 py-8 md:space-y-10 md:py-16">
                <div className="space-y-6">
                  <h1 className="animate-rise text-4xl leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-5xl md:text-6xl lg:text-7xl">
                    {t.heroTitle}
                  </h1>
                  <p
                    className="animate-rise text-muted max-w-[52ch] text-base leading-relaxed sm:text-lg"
                    style={{ animationDelay: "60ms" }}
                  >
                    {t.heroBody}
                  </p>
                </div>

                <ul className="space-y-5">
                  {proofs.map(({ Icon }, i) => {
                    const [title, body] = t.proofs[i]!;
                    return (
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
                    );
                  })}
                </ul>

                <div
                  className="animate-rise flex flex-wrap items-center gap-4"
                  style={{ animationDelay: "420ms" }}
                >
                  <button className={`${primary} w-full px-8 py-4 text-base sm:w-auto`} onClick={openConfig}>
                    {t.configure} <ArrowRight className="h-5 w-5" />
                  </button>
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
                    onLangHandler={(fn) => (langHandler.current = fn)}
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
    </LangProvider>
  );
}

type Section = "crear" | "emilys" | "resultados";
type Assist = "voice" | "preset" | null;

function ConfigureForm({
  onCreate,
  onClose,
  onLangHandler,
}: {
  onCreate: (c: Created) => void;
  onClose: () => void;
  /** Hands the form's ES/EN switch (UI + Emily's language + translation) to the top bar. */
  onLangHandler: (fn: ((l: Lang) => void) | null) => void;
}) {
  const { lang, setLang, t } = useLang();
  const [d, setD] = useState<Omit<Draft, "questions">>(() => emptyDraft(lang));
  const [questions, setQuestions] = useState<Question[]>(() => [emptyQuestion()]);
  const [branchIntent, setBranchIntent] = useState("");
  const [branching, setBranching] = useState(false);
  const [branchError, setBranchError] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineNote, setRefineNote] = useState("");
  const [areaDraft, setAreaDraft] = useState("");
  const [assist, setAssist] = useState<Assist>(null);
  const [status, setStatus] = useState<{ voice: boolean; llm: boolean; engine?: string }>({
    voice: false,
    llm: false,
  });
  const [flash, setFlash] = useState(0); // bumps when AI fills fields → brief highlight
  const [langNote, setLangNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [translating, setTranslating] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false); // "delete the setup progress?" alert

  useEffect(() => {
    aiStatus()
      .then(setStatus)
      .catch(() => {});
  }, []);

  const filled = prune(questions);
  const draft: Draft = { ...d, questions: filled };
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));

  const applyPatch = useCallback((p: Patch) => {
    const { questions: qs, ...rest } = p;
    setD((x) => ({ ...x, ...rest }));
    if (qs?.length) setQuestions(toQuestions(qs));
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
      setRefineNote(auto ? `${t.proposed} ${r.note}` : r.note);
    } catch (err) {
      if (!auto) setRefineNote(friendlyError(err, t.noQs));
    } finally {
      setRefining(false);
    }
  }

  /**
   * The ES/EN switch: UI language, the language Emily will speak, and — when there is content —
   * an AI translation of project, goal, questions and areas into the new language.
   */
  async function changeLang(next: Lang, { ui = true } = {}) {
    if (translating) return;
    if (ui) {
      if (next === lang) return;
      setLang(next);
    }
    if (next === d.locale) return; // the content is already in that language
    const nt = dict[ui ? next : lang]; // notes in the screen's language
    set("locale", next);
    setLangNote("");
    const hasContent = draft.objective.trim() || draft.questions.length || draft.areas.length;
    if (!hasContent) return;
    setTranslating(true);
    setLangNote(nt.translating);
    try {
      const tr = await translateDraft(draft, next);
      if (!tr) return setLangNote(nt.cantTranslate);
      setD((x) => ({ ...x, project: tr.project, objective: tr.objective, areas: tr.areas }));
      setQuestions(toQuestions(tr.questions));
      setFlash((n) => n + 1);
      setLangNote(nt.translated);
    } catch {
      setLangNote(nt.cantTranslate);
    } finally {
      setTranslating(false);
    }
  }

  /** Starts over: every field empty (the voice studio's "delete progress"). */
  function reset() {
    setD(emptyDraft(lang));
    setQuestions([emptyQuestion()]);
    setAreaDraft("");
    setRefineNote("");
    setLangNote("");
    setSaveError("");
  }

  function addArea() {
    const a = areaDraft.trim();
    if (a && !d.areas.includes(a)) set("areas", [...d.areas, a]);
    setAreaDraft("");
  }

  /** "Generate branching with AI": the admin's intent → a yes/no question with both branches. */
  async function genBranch() {
    if (branching || branchIntent.trim().length < 5) return;
    setBranching(true);
    setBranchError("");
    try {
      const { question, replaces, absorbs } = await generateBranching(branchIntent, draft);
      // It takes the place of a question about the same thing (no duplicate), else goes last;
      // questions that only fit one branch now live in it. One pass over the whole list: the
      // new question can't reuse an id already taken.
      setQuestions((qs) => {
        const kept = qs.filter((x) => x.text.trim() && !absorbs.includes(x.id));
        const at = kept.findIndex((x) => x.id === replaces);
        return toQuestions(
          at < 0 ? [...kept, question] : [...kept.slice(0, at), question, ...kept.slice(at + 1)],
        );
      });
      setBranchIntent("");
      setFlash((n) => n + 1);
    } catch (err) {
      setBranchError(friendlyError(err, t.genBranchError));
    } finally {
      setBranching(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await create();
  }

  async function create() {
    if (missingFields(draft).length || saving) return;
    const fmt =
      d.expires && new Date(`${d.expires}T23:59`).toLocaleDateString(lang, { dateStyle: "long" });
    setSaving(true);
    setSaveError("");
    let slug: string;
    try {
      slug = await saveEmily(draft);
    } catch {
      return setSaveError(t.saveError);
    } finally {
      setSaving(false);
    }
    onCreate({
      slug,
      url: `${LINK_BASE}/${slug}`,
      project: d.project,
      recipient: [d.recipientName, d.company].filter(Boolean).join(" · ") || t.openLink,
      questions: filled.length,
      areas: d.areas.length,
      locale: d.locale,
      status: t.statusLine(d.status === "active", d.noExpiry || !fmt ? "" : fmt),
      draft,
    });
  }

  const hl = flash ? "animate-fill-flash" : "";
  // Anything worth keeping: closing asks first (voice answers or typed fields aren't lost by mistake).
  const hasData = !!(
    d.project.trim() ||
    d.objective.trim() ||
    d.recipientName.trim() ||
    d.company.trim() ||
    d.reportEmail.trim() ||
    d.areas.length ||
    filled.length
  );

  useEffect(() => {
    onLangHandler((l) => void changeLang(l));
    return () => onLangHandler(null);
  });

  // Esc inside the alert = continue.
  useEffect(() => {
    if (!confirmClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setConfirmClose(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmClose]);

  if (assist === "voice")
    return (
      <VoiceStudio
        draft={draft}
        openai={status.voice}
        realtime={status.engine === "realtime"}
        onPatch={applyPatch}
        onLang={(l) => void changeLang(l)}
        onEdit={() => {
          setAssist(null);
          setFlash((n) => n + 1);
        }}
        onDiscard={() => {
          reset();
          setAssist(null);
        }}
        onCreate={() => void create()}
        saving={saving}
        saveError={saveError}
      />
    );

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-8">
      {confirmClose && (
        <ExitAlert
          onDiscard={() => {
            reset();
            setConfirmClose(false);
            onClose();
          }}
          onContinue={() => setConfirmClose(false)}
        />
      )}
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] md:text-4xl">{t.configure}</h2>
          <p className="text-muted">
            {t.formSubtitle} <span className="text-xs">{status.llm ? t.aiOn : t.aiOff}</span>
          </p>
          {langNote && (
            <p
              role="status"
              className="text-accent flex items-center gap-2 text-sm transition-opacity duration-200 starting:opacity-0"
            >
              {translating && (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              {langNote}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => (hasData ? setConfirmClose(true) : onClose())}
            aria-label={t.close}
            className="text-muted hover:bg-accent-soft hover:text-accent grid h-10 w-10 place-items-center rounded-full transition"
          >
            <XIcon />
          </button>
        </div>
      </header>

      {/* Two assisted ways in */}
      <div className="grid gap-3 lg:grid-cols-2">
        <AssistCard
          active={false}
          onClick={() => setAssist("voice")}
          Icon={MicIcon}
          title={t.byVoice}
          body={t.byVoiceBody}
        />
        <AssistCard
          active={assist === "preset"}
          onClick={() => setAssist(assist === "preset" ? null : "preset")}
          Icon={SparkIcon}
          title={t.template}
          body={t.templateBody}
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
          <Field label={t.recipient} hint={t.recipientHint}>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className={`${field} ${hl}`}
                placeholder={t.name}
                aria-label={t.recipientName}
                autoComplete="off"
                value={d.recipientName}
                onChange={(e) => set("recipientName", e.target.value)}
              />
              <input
                className={`${field} ${hl}`}
                placeholder={t.company}
                aria-label={t.recipientCompany}
                autoComplete="off"
                value={d.company}
                onChange={(e) => set("company", e.target.value)}
              />
            </div>
          </Field>

          <Field label={t.project} htmlFor="project">
            <input
              id="project"
              className={`${field} ${hl}`}
              required
              placeholder={t.projectPh}
              value={d.project}
              onChange={(e) => set("project", e.target.value)}
            />
            <p className="text-muted mt-2 font-mono text-xs">
              {LINK_BASE}/<span className="text-accent">{toSlug(d.project) || t.projectSlug}</span>
            </p>
          </Field>

          <Field label={t.objective} htmlFor="objective" hint={t.objectiveHint}>
            <textarea
              id="objective"
              className={`${field} resize-y leading-relaxed ${hl}`}
              required
              minLength={10}
              rows={3}
              placeholder={t.objectivePh}
              value={d.objective}
              onChange={(e) => set("objective", e.target.value)}
              onBlur={() => {
                if (status.llm && !filled.length && d.objective.trim().length >= 25)
                  void refine(true);
              }}
            />
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field label={t.linkStatus} hint={t.linkStatusHint}>
              <Segmented
                label={t.linkStatus}
                value={d.status}
                onChange={(v) => set("status", v)}
                options={[
                  ["active", t.active],
                  ["paused", t.paused],
                ]}
              />
            </Field>
            {/* The language Emily interviews in (the screen's language doesn't change) */}
            <Field label={t.emilyLang} hint={t.emilyLangHint}>
              <Segmented
                label={t.emilyLang}
                value={d.locale}
                onChange={(v) => void changeLang(v, { ui: false })}
                options={[
                  ["es", "Español"],
                  ["en", "English"],
                ]}
              />
            </Field>
          </div>

          <Field label={t.voice} hint={t.voiceHint}>
            <VoicePicker value={d.voice} locale={d.locale} onChange={(v) => set("voice", v)} />
          </Field>

          <Field label={t.reportTo} htmlFor="reportEmail" hint={t.reportHint}>
            <input
              id="reportEmail"
              type="email"
              autoComplete="email"
              className={`${field} ${hl}`}
              placeholder={t.reportPh}
              value={d.reportEmail}
              onChange={(e) => set("reportEmail", e.target.value.trim())}
            />
          </Field>

          <Field label={t.expiry} htmlFor="expires">
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
                {t.noExpiry}
              </label>
            </div>
          </Field>
        </div>

        <div className="space-y-7">
          <Field label={t.questions} hint={t.questionsHint}>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={quiet}
                disabled={refining || d.objective.trim().length < 10}
                onClick={() => void refine()}
                title={d.objective.trim().length < 10 ? t.objectiveFirst : undefined}
              >
                {refining ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <SparkIcon className="h-4 w-4" />
                )}
                {refining ? t.thinkingQs : filled.length ? t.improveQs : t.writeQs}
              </button>
              {refineNote && (
                <p className="text-muted text-sm transition-opacity duration-200 starting:opacity-0">
                  {refineNote}
                </p>
              )}
            </div>
            <QuestionTree list={questions} onChange={setQuestions} highlight={hl} />
            <button
              type="button"
              onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}
              className="text-accent mt-3 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
            >
              <PlusIcon className="h-4 w-4" /> {t.addQuestion}
            </button>
            {status.llm && (
              <div className="border-border mt-4 space-y-2 rounded-2xl border border-dashed p-3">
                <label htmlFor="branch-intent" className="flex items-center gap-1.5 text-sm font-medium">
                  <SparkIcon className="text-accent h-4 w-4" /> {t.genBranch}
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="branch-intent"
                    className={field}
                    placeholder={t.genBranchPh}
                    value={branchIntent}
                    maxLength={300}
                    onChange={(e) => setBranchIntent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      void genBranch();
                    }}
                  />
                  <button
                    type="button"
                    className={`${quiet} shrink-0`}
                    disabled={branching || branchIntent.trim().length < 5}
                    onClick={() => void genBranch()}
                  >
                    {branching ? t.genBranchBusy : t.genBranchGo}
                  </button>
                </div>
                {branchError && <p className="text-sm text-red-600 dark:text-red-400">{branchError}</p>}
              </div>
            )}
          </Field>

          <Field label={t.areas} htmlFor="area" hint={t.areasHint}>
            <div className="flex gap-2">
              <input
                id="area"
                className={field}
                placeholder={t.areasPh}
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
                {t.add}
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
                      aria-label={t.removeArea(a)}
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

      {/* At the end of the form on every screen size (it never covers the fields) */}
      <div className="border-border flex flex-wrap items-center justify-between gap-4 border-t pt-6">
        <p className="text-muted text-sm tabular-nums">
          {t.nQuestions(filled.length)} · {t.nAreas(d.areas.length)} · {t.langName}
          {missingFields(draft).length > 0 &&
            t.missing(
              missingFields(draft)
                .map((m) => t.missingNames[m])
                .join(", "),
            )}
        </p>
        {saveError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {saveError}
          </p>
        )}
        <button className={primary} disabled={missingFields(draft).length > 0 || saving}>
          {saving ? t.saving : t.create} <ArrowRight className="h-4 w-4" />
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

const TRANSCRIPT_KEY = "emily:transcript"; // per-browser preference

function readTranscriptPref() {
  try {
    return localStorage.getItem(TRANSCRIPT_KEY) !== "off";
  } catch {
    return true;
  }
}

/**
 * Setup by voice, full screen like its own landing: Emily big in the middle. The user picks a
 * language (Emily then speaks only that one), she asks what's needed to create the Emily, and the
 * conversation rises under her without scrolling (optional transcript). She never asks for the
 * report email — that's added in the settings — and ends with a summary: Edit or Finish.
 */
function VoiceStudio({
  draft,
  openai,
  realtime,
  onPatch,
  onLang,
  onEdit,
  onDiscard,
  onCreate,
  saving,
  saveError,
}: {
  draft: Draft;
  openai: boolean;
  /** Server default engine is realtime (?engine=classic forces the classic one). */
  realtime: boolean;
  onPatch: (p: Patch) => void;
  onLang: (l: Lang) => void;
  onEdit: () => void;
  onDiscard: () => void;
  onCreate: () => void;
  saving: boolean;
  saveError: string;
}) {
  const { lang, t } = useLang();
  const [phase, setPhase] = useState<"pick" | "talk" | "review">("pick");
  const [mode, setMode] = useState<OrbMode>("listening");
  const [transcript, setTranscript] = useState(readTranscriptPref);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [keyboard, setKeyboard] = useState(false);
  const [typed, setTyped] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const [exitAsk, setExitAsk] = useState(false); // "delete the setup progress?" alert
  const [consent, setConsent] = useState<Lang | null>(null); // "before using voice" notice
  const [paused, setPaused] = useState(false); // the user paused the conversation
  const voice = useEmilyVoice({
    openai,
    locale: draft.locale,
    voice: draft.voice,
    onMode: setMode,
  });
  const draftRef = useRef(draft);
  const rtv = useSetupRealtime({
    draftRef,
    onPatch,
    // Same speaker twice in a row (an answer completed after interrupting her) → one bubble.
    onMsg: (from, text) =>
      setMsgs((m) =>
        m.at(-1)?.from === from
          ? [...m.slice(0, -1), { from, text: `${m.at(-1)!.text} ${text}` }]
          : [...m, { from, text }],
      ),
    onMode: setMode,
    onDone: () => setPhase("review"),
  });
  const alive = useRef(true);
  const pendingTyped = useRef(""); // a typed answer, taken by the next listenText()
  const lastSaid = useRef(""); // the user's previous answer (merged when they add to it)
  const greeted = useRef(false);

  useEffect(() => {
    draftRef.current = draft;
  });

  // Full screen: no page scroll behind it.
  useEffect(() => {
    alive.current = true;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      alive.current = false;
      document.body.style.overflow = overflow;
    };
  }, []);

  // Esc = the X (asks before deleting); inside that alert, Esc = continue.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (exitAsk) keepGoing();
      else askExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Greeting once the chosen language is applied (the voice hook speaks the current locale).
  useEffect(() => {
    if (phase !== "talk" || greeted.current) return;
    greeted.current = true;
    void voice.say(dict[draft.locale].greeting).then(() => listenTurn());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start of the conversation only
  }, [phase, draft.locale]);

  /** Language chosen: first the voice/privacy notice, then the microphone. */
  function pick(next: Lang) {
    setConsent(next);
  }

  function start(next: Lang) {
    setConsent(null);
    voice.unlock(); // inside the click: the browser lets Emily's audio play
    onLang(next); // UI + Emily's language (existing content is translated)
    draftRef.current = { ...draftRef.current, locale: next };
    setPhase("talk");
    const forced = new URLSearchParams(window.location.search).get("engine");
    if (openai && (forced ? forced === "realtime" : realtime)) {
      greeted.current = true; // Emily greets over the realtime call
      rtv
        .start(dict[next].greeting, next)
        .then((ok) => ok || startClassic(next))
        .catch((err: unknown) => setError(micError(err, next)));
      return;
    }
    startClassic(next);
  }

  /** Classic engine (no realtime, or it failed): recorded turns, TTS replies. */
  function startClassic(next: Lang) {
    // Mic permission right away (iOS prompts reliably close to the tap).
    voice.openMic().catch((err: unknown) => setError(micError(err, next)));
    setMsgs([{ from: "emily", text: dict[next].greeting }]);
    if (greeted.current) {
      void voice.say(dict[next].greeting).then(() => listenTurn());
    }
  }

  function toggleTranscript() {
    const next = !transcript;
    setTranscript(next);
    try {
      localStorage.setItem(TRANSCRIPT_KEY, next ? "on" : "off");
    } catch {}
  }

  function leave() {
    alive.current = false;
    rtv.close();
    voice.cancel();
    onEdit();
  }

  /** The X: pause Emily and ask whether to delete the setup progress. */
  function askExit() {
    if (exitAsk) return;
    if (rtv.active) {
      if (!paused) rtv.pause();
      return setExitAsk(true);
    }
    alive.current = false;
    voice.cancel();
    setExitAsk(true);
  }

  /** "Continue": back in the studio; Emily listens again where the conversation was. */
  /** Pause: Emily stops talking and listening (not while a reply is being worked out). */
  function pause() {
    if (rtv.active) {
      if (paused) return;
      rtv.pause();
      return setPaused(true);
    }
    if (phase !== "talk" || paused || thinking || voice.state === "transcribing") return;
    alive.current = false;
    voice.cancel();
    setPaused(true);
  }

  /** Resume: Emily repeats her last line, then listens again. */
  async function resume() {
    setPaused(false);
    if (rtv.active) return rtv.resume();
    setThinking(false);
    alive.current = true;
    const last = [...msgs].reverse().find((m) => m.from === "emily")?.text;
    if (last) await voice.say(last);
    if (alive.current) void listenTurn();
  }

  function keepGoing() {
    setExitAsk(false);
    if (rtv.active) return void (paused || rtv.resume());
    setThinking(false); // a reply in flight was dropped when the alert opened
    if (paused) return; // it was paused before the alert: stays paused
    alive.current = true;
    if (phase === "talk") void listenTurn();
  }

  function discard() {
    rtv.close();
    voice.cancel();
    onDiscard();
  }

  async function review() {
    alive.current = false;
    voice.cancel();
    if (rtv.active) {
      rtv.pause();
      setThinking(true);
      await rtv.settled(); // everything said so far is in the fields
      setThinking(false);
      rtv.close();
    }
    setPhase("review");
  }

  const L = () => dict[draftRef.current.locale]; // Emily's lines: always the chosen language
  const youSaid = (text: string) => setMsgs((m) => [...m, { from: "you", text }]);

  async function sayLine(line: string) {
    setMsgs((m) => [...m, { from: "emily", text: line }]);
    await voice.say(line);
  }

  /** Next answer: what the user says (hands-free, ends on silence) or types meanwhile. */
  async function listenText(): Promise<string> {
    const take = () => {
      const v = pendingTyped.current;
      pendingTyped.current = "";
      return v;
    };
    if (pendingTyped.current) return take();
    const heard = await voice.listen();
    return pendingTyped.current ? take() : heard;
  }

  /** A line that expects an answer. If the user talks over Emily, she stops and asks. */
  async function ask(line: string) {
    setMsgs((m) => [...m, { from: "emily", text: line }]);
    const interrupted = await voice.say(line, { interruptible: true });
    if (!alive.current) return;
    return interrupted ? bargeIn() : listenTurn();
  }

  async function listenTurn(): Promise<void> {
    if (!alive.current) return;
    setError("");
    try {
      const text = await listenText();
      if (!alive.current) return;
      if (!text) {
        await voice.say(L().didntHear);
        return listenTurn();
      }
      await handle(text);
    } catch (err) {
      setError(micError(err, draftRef.current.locale));
    }
  }

  /** "That's all": goodbye, then the summary of everything configured. */
  async function finish() {
    await sayLine(L().vsClosing);
    if (alive.current) setPhase("review");
  }

  /**
   * Works out the reply to `text`. If the user starts talking again meanwhile, that work is
   * dropped, Emily listens to the rest, and both parts are processed together.
   */
  async function think(text: string, base: Draft) {
    for (;;) {
      setThinking(true);
      let heard = () => {};
      const spoke = new Promise<"spoke">((r) => (heard = () => r("spoke")));
      // Recorded from the first syllable, so nothing said meanwhile is lost.
      const next = voice.listen({ onSpeech: heard });
      const drop = () => {
        voice.discardTurn();
        void next.catch(() => {});
      };
      let res: Awaited<ReturnType<typeof fillFromSpeech>> | "spoke";
      try {
        res = await Promise.race([fillFromSpeech(text, base), spoke]);
      } catch (err) {
        drop();
        throw err;
      } finally {
        setThinking(false);
      }
      if (res !== "spoke") {
        drop();
        return { ...res, text };
      }
      const more = await next;
      if (!alive.current) return null;
      if (more) {
        youSaid(more);
        text = `${text} ${more}`;
      }
    }
  }

  async function handle(said: string) {
    youSaid(said);
    try {
      const out = await think(said, draftRef.current);
      if (!out || !alive.current) return;
      const { patch, reply, done, text } = out;
      lastSaid.current = text;
      const fields: Patch = { ...patch };
      delete fields.locale; // the language was chosen explicitly
      onPatch(fields);
      setThinking(false);
      const complete =
        done && missingFields({ ...draftRef.current, ...fields } as Draft).length === 0;
      return complete ? finish() : ask(reply);
    } catch (err) {
      setThinking(false);
      setError(friendlyError(err, t.somethingFailed));
    }
  }

  /** The user talked over Emily: "anything else?", then merge it with what they said before. */
  async function bargeIn() {
    try {
      await sayLine(L().vsMore);
      const more = await listenText();
      if (!alive.current) return;
      if (!more) return listenTurn();
      youSaid(more);
      await confirm(`${lastSaid.current} ${more}`.trim(), {});
    } catch (err) {
      setThinking(false);
      setError(
        err instanceof Error && err.name === "NotAllowedError"
          ? micError(err, draftRef.current.locale)
          : friendlyError(err, t.somethingFailed),
      );
    }
  }

  /**
   * Reads back what Emily understood from `text` (on top of the still-unsaved `pending` fields)
   * and asks if it's right: yes → saved; no → "what should I change?" and confirm again.
   */
  async function confirm(said: string, pending: Patch): Promise<void> {
    const out = await think(said, { ...draftRef.current, ...pending } as Draft);
    if (!out || !alive.current) return;
    const { patch, reply, done, text } = out;
    const merged: Patch = { ...pending, ...patch };
    delete merged.locale;
    for (;;) {
      await sayLine(L().vsNoted(notedSummary(draftRef.current, merged, text, L())));
      const answer = await listenText();
      if (!alive.current) return;
      if (!answer) {
        await voice.say(L().didntHear);
        continue;
      }
      youSaid(answer);
      const kind = answerKind(answer);
      if (kind === "yes") {
        onPatch(merged);
        lastSaid.current = text;
        const complete =
          done && missingFields({ ...draftRef.current, ...merged } as Draft).length === 0;
        return complete ? finish() : ask(`${L().vsSaved} ${reply}`);
      }
      if (kind === "no") {
        await sayLine(L().vsFix);
        const fix = await listenText();
        if (!alive.current) return;
        if (!fix) continue;
        youSaid(fix);
        return confirm(fix, merged);
      }
      return confirm(answer, merged); // they said the correction straight away
    }
  }

  /** A typed answer replaces the recording in progress (or Emily's line being spoken). */
  function sendTyped() {
    const text = typed.trim();
    if (!text) return;
    if (rtv.active) {
      setTyped("");
      setPaused(false);
      return rtv.sendText(text);
    }
    pendingTyped.current = text;
    setTyped("");
    voice.cancel();
    if (paused) {
      // Typing while paused resumes the conversation with that answer.
      setPaused(false);
      alive.current = true;
      return void listenTurn();
    }
    if (voice.state === "idle" && !thinking) void listenTurn(); // nothing was waiting for it
  }

  // Realtime: always listening, never blocked; the fields fill in the background.
  const vs = rtv.active ? rtv : voice;
  const recording = vs.state === "recording";
  const busy =
    !rtv.active && (thinking || voice.state === "transcribing" || voice.state === "preparing");
  const status = paused
    ? t.pausedNow
    : recording
      ? t.stRecording
      : vs.state === "transcribing"
        ? t.stTranscribing
        : thinking || (rtv.filling && vs.state === "idle")
          ? t.stFilling
          : voice.state === "preparing"
            ? t.lThinking
            : vs.state === "speaking"
              ? t.stSpeaking
              : "";
  const shown = msgs.slice(-4);

  // Portal to <body>: an animated (transformed) ancestor would otherwise turn "fixed" into
  // "inside that box" — on phones the studio didn't cover the screen.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.voiceTitle}
      className="bg-accent-deep fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-white transition-opacity duration-300 ease-out sm:px-6 md:px-10 starting:opacity-0"
    >
      <header className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold tracking-[0.3em] uppercase">
          NEO<span className="text-violet-300">era</span>
        </p>
        <button
          type="button"
          onClick={askExit}
          aria-label={t.vsExit}
          className="grid h-10 w-10 place-items-center rounded-full text-violet-100 transition-colors hover:bg-white/10"
        >
          <XIcon />
        </button>
      </header>

      <main
        className={`flex min-h-0 flex-1 flex-col items-center justify-center gap-4 sm:gap-6 ${
          phase === "pick" ? "" : "md:flex-row md:gap-16 lg:gap-24"
        }`}
      >
        {/* Emily (left while talking, centered while picking the language) */}
        <div className="flex shrink-0 flex-col items-center gap-6">
          {/* Smaller orb on phones (negative margin keeps its layout box tight) */}
          <div className="-my-7 scale-[0.72] sm:my-0 sm:scale-100 md:scale-125">
            <VoiceOrb mode={phase === "talk" ? mode : "listening"} />
          </div>
          {phase !== "pick" && (
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm font-medium text-violet-100 backdrop-blur">
              <span
                className={`h-2 w-2 rounded-full ${
                  recording ? "animate-pulse bg-emerald-300" : "animate-pulse bg-fuchsia-300"
                }`}
              />
              <span key={status} className="animate-rise">
                {status || (mode === "speaking" ? t.speaking : t.listening)}
              </span>
            </span>
          )}
        </div>

        {phase === "pick" ? (
          <div className="animate-rise flex flex-col items-center gap-6 text-center">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
                {dict.es.vsChoose}
              </h1>
              <p className="text-violet-200">{dict.en.vsChoose}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {(
                [
                  ["es", "Español"],
                  ["en", "English"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => pick(id)}
                  className="text-accent-deep min-w-36 rounded-full bg-white px-7 py-3.5 text-[15px] font-semibold shadow-[0_12px_32px_-12px_rgb(0_0_0/0.6)] transition-[translate,scale] duration-160 ease-out hover:-translate-y-px active:scale-[0.97]"
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={transcript}
              onClick={toggleTranscript}
              className="flex items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-white/5"
            >
              <span
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
                  transcript ? "bg-fuchsia-300" : "bg-white/20"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-out ${
                    transcript ? "translate-x-5" : ""
                  }`}
                />
              </span>
              <span>
                <span className="block text-sm font-medium">{t.vsTranscript}</span>
                <span className="block text-xs text-violet-200">{t.vsTranscriptHint}</span>
              </span>
            </button>
          </div>
        ) : (
          <div className="flex w-full max-w-2xl min-w-0 flex-col items-center gap-6">
            {/* The conversation, right of Emily: last lines only, older ones fade — no scroll. */}
            <ol
              aria-live="polite"
              className="flex h-[min(14rem,30dvh)] w-full flex-col justify-end gap-2.5 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_35%)] md:h-[22rem]"
            >
              {transcript &&
                shown.map((m, i) => (
                  <li
                    key={msgs.length - shown.length + i}
                    className={`flex transition-[opacity,translate] duration-300 ease-out starting:translate-y-3 starting:opacity-0 ${
                      m.from === "you" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <p
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 leading-relaxed ${
                        m.from === "emily"
                          ? "rounded-bl-sm bg-white/12 text-white"
                          : "rounded-br-sm bg-fuchsia-300/25 text-fuchsia-50"
                      }`}
                    >
                      {m.text}
                    </p>
                  </li>
                ))}
              {transcript && recording && vs.interim && (
                <li className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl border border-dashed border-white/30 px-4 py-2.5 text-violet-100 italic">
                    {vs.interim}
                  </p>
                </li>
              )}
            </ol>

            {error && (
              <p role="alert" className="max-w-md text-center text-sm text-red-200">
                {error}
              </p>
            )}
          </div>
        )}
      </main>

      {/* Controls centered at the bottom of the screen */}
      {phase === "talk" && (
        <footer className="flex flex-col items-center gap-3 pt-4 pb-2">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={recording ? vs.stop : () => void listenTurn()}
              disabled={paused || busy || vs.state === "speaking" || (rtv.active && !recording)}
              aria-label={recording ? t.stopTalking : t.talk}
              className={`grid h-14 w-14 place-items-center rounded-full shadow-lg transition-[scale,background-color,opacity] duration-160 ease-out active:scale-[0.95] disabled:opacity-40 ${
                recording ? "bg-white text-red-500" : "bg-white/15 text-white"
              }`}
            >
              {recording ? <StopIcon /> : <MicIcon />}
            </button>
            <button
              type="button"
              onClick={paused ? () => void resume() : pause}
              disabled={!paused && !rtv.active && (thinking || voice.state === "transcribing")}
              aria-pressed={paused}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-violet-100 transition-colors hover:bg-white/10 disabled:opacity-40"
            >
              {paused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}
              {paused ? t.resume : t.pause}
            </button>
            <button
              type="button"
              onClick={() => setKeyboard((k) => !k)}
              className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-violet-100 transition-colors hover:bg-white/10"
            >
              {keyboard ? t.pHideKb : t.pTypeAnswer}
            </button>
            <button
              type="button"
              onClick={() => void review()}
              className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-violet-100 transition-colors hover:bg-white/10"
            >
              {t.vsReview}
            </button>
          </div>
          {keyboard && (
            <form
              className="flex w-full max-w-lg items-center gap-2 transition-[opacity,translate] duration-200 ease-out starting:translate-y-1 starting:opacity-0"
              onSubmit={(e) => {
                e.preventDefault();
                sendTyped();
              }}
            >
              <input
                className="w-full rounded-full border border-white/20 bg-white/10 px-5 py-3 text-white placeholder:text-violet-300 focus:border-white/60 focus:outline-none"
                placeholder={t.typePh}
                value={typed}
                disabled={busy}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
              />
              <button
                aria-label={t.sendTyped}
                disabled={!typed.trim() || busy}
                className="text-accent-deep grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white disabled:opacity-40"
              >
                <SendIcon className="h-4 w-4" />
              </button>
            </form>
          )}
        </footer>
      )}

      {exitAsk && <ExitAlert onDiscard={discard} onContinue={keepGoing} />}
      {consent && (
        <Alert
          title={dict[consent].vcTitle}
          body={dict[consent].vcBody}
          cancel={dict[consent].vcCancel}
          confirm={dict[consent].vsContinue}
          onCancel={() => setConsent(null)}
          onConfirm={() => start(consent)}
        />
      )}

      {phase === "review" && (
        <ReviewModal
          draft={draft}
          lang={lang}
          onEdit={leave}
          onCreate={onCreate}
          saving={saving}
          saveError={saveError}
        />
      )}
    </div>,
    document.body,
  );
}

const emptyDraft = (locale: Lang): Omit<Draft, "questions"> => ({
  recipientName: "",
  company: "",
  project: "",
  objective: "",
  areas: [],
  locale,
  status: "active",
  expires: "",
  noExpiry: false,
  voice: "marin",
  reportEmail: "",
});

/** Leaving the voice studio: delete the setup progress, or keep going. */
function ExitAlert({ onDiscard, onContinue }: { onDiscard: () => void; onContinue: () => void }) {
  const { t } = useLang();
  return (
    <Alert
      title={t.vsDiscardTitle}
      body={t.vsDiscardBody}
      cancel={t.vsDiscardYes}
      confirm={t.vsContinue}
      onCancel={onDiscard}
      onConfirm={onContinue}
      danger
    />
  );
}

/** Emily-styled confirmation dialog: a quiet (or red, with `danger`) button and a primary one. */
function Alert({
  title,
  body,
  cancel,
  confirm,
  onCancel,
  onConfirm,
  danger = false,
}: {
  title: string;
  body: string;
  cancel: string;
  confirm: string;
  onCancel: () => void;
  onConfirm: () => void;
  danger?: boolean;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/55 p-4 backdrop-blur-sm transition-opacity duration-200 ease-out starting:opacity-0">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-title"
        aria-describedby="alert-body"
        className="bg-card text-foreground w-full max-w-md space-y-5 rounded-3xl p-6 shadow-2xl transition-[opacity,translate,scale] duration-200 ease-out md:p-7 starting:translate-y-2 starting:scale-[0.98] starting:opacity-0"
      >
        <div className="space-y-2">
          <h2 id="alert-title" className="text-xl font-semibold tracking-[-0.01em]">
            {title}
          </h2>
          <p id="alert-body" className="text-muted text-sm leading-relaxed">
            {body}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className={
              danger
                ? `${quiet} border-red-500/40 text-red-600 hover:border-red-500 hover:text-red-600 dark:text-red-400`
                : quiet
            }
          >
            {cancel}
          </button>
          <button type="button" className={primary} onClick={onConfirm} autoFocus>
            {confirm}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

/** What Emily reads back for confirmation: only what the patch adds or changes. */
function notedSummary(prev: Draft, p: Patch, said: string, t: Strings) {
  const parts: string[] = [];
  const who = [p.recipientName, p.company].filter(Boolean).join(" · ");
  if (who) parts.push(`${t.factFor}: ${who}`);
  if (p.project && p.project !== prev.project) parts.push(`${t.capProject}: ${p.project}`);
  if (p.objective && p.objective !== prev.objective)
    parts.push(`${t.capObjective}: ${p.objective}`);
  const before = new Set(prev.questions.map((q) => q.text.trim().toLowerCase()));
  const added = toQuestions(p.questions ?? []).filter(
    (q) => !before.has(q.text.trim().toLowerCase()),
  );
  if (added.length)
    parts.push(
      `${t.vsNewQs(added.length)}: ${added
        .slice(0, 3)
        .map((q) => q.text)
        .join(" ")}`,
    );
  if (p.areas?.length) parts.push(`${t.factAreas}: ${p.areas.join(", ")}`);
  return parts.length ? parts.join(". ") : `“${said}”`;
}

/** End of the voice setup: everything Emily configured, then Edit (form) or Finish (create). */
function ReviewModal({
  draft,
  lang,
  onEdit,
  onCreate,
  saving,
  saveError,
}: {
  draft: Draft;
  lang: Lang;
  onEdit: () => void;
  onCreate: () => void;
  saving: boolean;
  saveError: string;
}) {
  const { t } = useLang();
  const voice = voices.find((v) => v.id === draft.voice);
  const missing = missingFields(draft);
  const until =
    draft.noExpiry || !draft.expires
      ? ""
      : new Date(`${draft.expires}T23:59`).toLocaleDateString(lang, { dateStyle: "long" });
  const facts: [string, string][] = [
    [t.capProject, draft.project || "—"],
    [t.capObjective, draft.objective || "—"],
    [t.factFor, [draft.recipientName, draft.company].filter(Boolean).join(" · ") || t.openLink],
    [t.factLang, t.langOf[draft.locale]],
    [t.factVoice, voice ? `${voice.name} · ${voice.desc[lang]}` : "—"],
    [t.factLink, t.statusLine(draft.status === "active", until)],
    [t.factReport, draft.reportEmail || t.vsEmailLater],
    ...(draft.areas.length ? [[t.factAreas, draft.areas.join(", ")] as [string, string]] : []),
  ];

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/55 p-4 backdrop-blur-sm transition-opacity duration-200 ease-out starting:opacity-0">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        className="bg-card text-foreground flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl shadow-2xl transition-[opacity,translate,scale] duration-300 ease-out starting:translate-y-3 starting:scale-[0.98] starting:opacity-0"
      >
        <div className="space-y-6 overflow-y-auto p-6 md:p-10">
          <header className="space-y-1">
            <h2 id="review-title" className="text-2xl font-semibold tracking-[-0.02em]">
              {t.vsReviewTitle}
            </h2>
            <p className="text-muted text-sm">{t.vsReviewBody}</p>
          </header>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-10">
            <dl className="divide-border border-border divide-y rounded-2xl border px-5">
              {facts.map(([label, value]) => (
                <div key={label} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
                  <dt className="text-muted text-sm">{label}</dt>
                  <dd
                    className={`text-sm ${value === t.vsEmailLater ? "text-accent font-medium" : ""}`}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="space-y-3">
              <h3 className="font-semibold">
                {t.willAsk} · {t.nQuestions(draft.questions.length)}
              </h3>
              <ol className="space-y-2">
                {draft.questions.map((q, i) => (
                  <li
                    key={i}
                    className="bg-accent-soft/50 flex flex-wrap items-start gap-3 rounded-xl px-4 py-3"
                  >
                    <span className="text-accent mt-0.5 text-sm font-semibold tabular-nums">
                      {i + 1}.
                    </span>
                    <span className="min-w-0 flex-1 text-sm leading-relaxed break-words">{q.text}</span>
                    <KindTag kind={q.kind} />
                    <BranchesView q={q} />
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        <footer className="border-border flex flex-col items-center gap-3 border-t p-5">
          {(missing.length > 0 || saveError) && (
            <p role="alert" className="text-center text-sm text-red-600 dark:text-red-400">
              {saveError || t.missing(missing.map((m) => t.missingNames[m]).join(", "))}
            </p>
          )}
          <div className="grid w-full max-w-md grid-cols-2 gap-3">
            <button type="button" className={`${quiet} w-full justify-center`} onClick={onEdit}>
              {t.vsEdit}
            </button>
            <button
              type="button"
              className={`${primary} w-full justify-center`}
              disabled={missing.length > 0 || saving}
              onClick={onCreate}
            >
              {saving ? t.saving : t.finish} <CheckIcon className="h-4 w-4" />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

/** Predefined configurations: pick a type, name the business, the AI writes the rest. */
function PresetPicker({ locale, onPatch }: { locale: "es" | "en"; onPatch: (p: Patch) => void }) {
  const { lang, t } = useLang();
  const words = (p: (typeof presets)[number]) => (lang === "en" ? p.en : p);
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
      setError(friendlyError(err, t.presetError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      aria-label={t.templates}
      className="border-accent/30 bg-card animate-reveal space-y-5 rounded-2xl border p-5"
    >
      <div
        role="radiogroup"
        aria-label={t.interviewType}
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
            <span className="block text-sm font-medium">{words(p).label}</span>
            <span className="text-muted mt-0.5 block text-xs">{words(p).desc}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-64 flex-1 space-y-1.5">
          <span className="text-sm font-medium">{words(preset).context}</span>
          <input
            className={field}
            placeholder={words(preset).placeholder}
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
          {loading ? t.generating : t.generate}
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
  const { lang, t } = useLang();
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
    [t.factFor, c.recipient],
    [t.factQuestions, String(c.questions)],
    [t.factAreas, String(c.areas)],
    [t.factLang, t.langOf[c.locale]],
    [t.factVoice, voice ? `${voice.name} · ${voice.desc[lang]}` : "—"],
    [t.factReport, c.draft.reportEmail || t.onlyResults],
    [t.factLink, c.status],
  ];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-12 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="max-w-2xl space-y-8">
        <div className="space-y-3">
          <p className="text-accent inline-flex items-center gap-2 font-medium">
            <CheckIcon className="h-5 w-5" /> {t.ready}
          </p>
          <h2 className="text-3xl font-semibold tracking-[-0.03em] text-balance break-words sm:text-4xl">
            {c.project}
          </h2>
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
              {copied ? t.copied : t.copy}
            </button>
          </div>
          <p className="text-muted text-xs break-words">{t.domainNote(c.url)}</p>
        </div>

        <dl className="divide-border border-border divide-y border-y">
          {facts.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-6 py-3 text-sm">
              <dt className="text-muted">{k}</dt>
              <dd className="min-w-0 text-right font-medium break-words">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap gap-3">
          <button className={primary} onClick={() => setTesting(true)}>
            <MicIcon className="h-4 w-4" /> {t.testHere}
          </button>
          <Link href={path} target="_blank" className={quiet}>
            {t.asParticipant} <ArrowRight className="h-4 w-4" />
          </Link>
          <button className={quiet} onClick={onDone}>
            <CheckIcon className="h-4 w-4" /> {t.finishExit}
          </button>
        </div>
      </div>

      <section aria-label={t.factQuestions} className="space-y-4">
        <h3 className="font-medium">{t.willAsk}</h3>
        <ol className="space-y-2">
          {c.draft.questions.map((q, i) => (
            <li
              key={i}
              className="border-border bg-card flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3"
            >
              <span className="text-accent w-5 shrink-0 text-sm font-medium tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm leading-relaxed break-words">{q.text}</span>
              <KindTag kind={q.kind} />
              <BranchesView q={q} />
            </li>
          ))}
        </ol>
        {c.draft.areas.length > 0 && (
          <p className="text-muted text-sm">{t.digInto(c.draft.areas.join(", "))}</p>
        )}
      </section>
    </div>
  );
}

function KindTag({ kind }: { kind: QuestionKind }) {
  const { t } = useLang();
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
        kind === "abierta"
          ? "bg-accent-soft text-accent"
          : "bg-sky-500/15 text-sky-700 dark:text-sky-300"
      }`}
    >
      {kind === "abierta" ? t.open : t.closed}
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
  const { t } = useLang();
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
      aria-label={t.voice}
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
              <span className="text-muted block truncate text-xs">{v.desc[locale]}</span>
            </span>
            <button
              type="button"
              aria-label={t.listen(v.name)}
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
  compact = false,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
  compact?: boolean;
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
          className={`rounded-full text-sm transition ${compact ? "px-3 py-1.5 font-medium" : "px-5 py-2"} ${
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
