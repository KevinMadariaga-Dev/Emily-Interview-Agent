"use client";

import { useEffect, useRef, useState } from "react";
import type { InterviewSummary } from "./ai";
import type { NotionStatus, ReportStatus } from "./report";
import { coverage, verdict, type AnswerStatus, type Draft, type QuestionKind } from "./config";
import { LangProvider, useLang } from "./i18n";
import { CheckIcon, MicIcon, SendIcon, SparkIcon, StopIcon, XIcon } from "./icons";
import { field, IconBtn, primary, quiet, type Msg } from "./ui";
import { useInterviewSession } from "./use-interview";
import type { OrbMode } from "./voice-orb";

/**
 * Interview with a created Emily: she asks (TTS), listens hands-free (STT) or reads typed
 * answers, follows up with the LLM, closes, and scores how much of the required information
 * was obtained.
 */
export function InterviewLive({
  draft,
  onMode,
  onFeed,
  onExit,
  slug,
}: {
  draft: Draft;
  onMode: (m: OrbMode | null) => void;
  onFeed: (m: Msg[]) => void;
  onExit?: () => void;
  /** When set, the result is saved under this Emily (shown in "Resultados"). */
  slug?: string;
}) {
  const { t, setLang } = useLang();
  const [typed, setTyped] = useState("");
  const listEnd = useRef<HTMLLIElement>(null);
  const questions = draft.questions;
  const total = questions.length;
  const {
    openai,
    phase,
    history,
    covered,
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
  } = useInterviewSession({ draft, slug, onMode });

  useEffect(() => {
    onFeed(history.map((t) => ({ from: t.role === "emily" ? "emily" : "you", text: t.text })));
    listEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [history, onFeed]);

  function sendTyped() {
    if (answerTyped(typed)) setTyped("");
  }

  const recording = voice.state === "recording";

  return (
    <section aria-label={t.lTitle} className="flex min-h-[70dvh] flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-accent text-sm font-medium">{t.lTitle}</p>
          <h2 className="text-3xl font-semibold tracking-[-0.03em] text-balance">
            {draft.project}
          </h2>
          <p className="text-muted text-sm">{t.lSubtitle}</p>
        </div>
        {onExit && (
          <button
            type="button"
            className={quiet}
            onClick={() => {
              stopAll();
              onExit();
            }}
          >
            <XIcon className="h-4 w-4" /> {t.lExit}
          </button>
        )}
      </header>

      {phase === "ready" ? (
        <div className="grid flex-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="border-border bg-card flex flex-col items-center justify-center gap-5 rounded-2xl border p-10 text-center">
            <p className="max-w-md text-lg">{t.lIntro(total)}</p>
            <p className="text-muted text-sm">{openai ? t.pOpenai : t.lBrowser}</p>
            <button className={`${primary} px-8 py-4 text-base`} onClick={() => void run()}>
              <MicIcon className="h-5 w-5" /> {t.pStart}
            </button>
          </div>
          <QuestionChecklist questions={questions} covered={-1} />
        </div>
      ) : phase === "done" && summary ? (
        <LangProvider value={{ lang: draft.locale, setLang }}>
          <div lang={draft.locale} className="space-y-4">
            <ReportNotice report={report} to={draft.reportEmail} />
            <NotionNotice notion={notion} />
            <SuccessReport summary={summary} onRestart={restart} onExit={onExit} />
          </div>
        </LangProvider>
      ) : (
        <div className="grid flex-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-h-0 flex-col gap-4">
            <ol
              aria-live="polite"
              className="border-border bg-card max-h-[55dvh] min-h-64 flex-1 space-y-3 overflow-y-auto rounded-2xl border p-5"
            >
              {history.map((t, i) => (
                <li
                  key={i}
                  className={`flex transition-[opacity,translate] duration-200 ease-out starting:translate-y-1 starting:opacity-0 ${
                    t.role === "participant" ? "justify-end" : ""
                  }`}
                >
                  <p
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 leading-relaxed ${
                      t.role === "emily"
                        ? "bg-accent-soft/70 rounded-tl-sm"
                        : "bg-accent text-accent-foreground rounded-tr-sm"
                    }`}
                  >
                    {t.text}
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
              {phase === "summarizing" && (
                <li className="text-muted flex items-center gap-2 text-sm">
                  <span className="border-accent h-3.5 w-3.5 animate-spin rounded-full border-2 border-t-transparent" />
                  {t.lEvaluating}
                </li>
              )}
              <li ref={listEnd} aria-hidden />
            </ol>

            {error && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            {phase === "live" && (
              <div className="space-y-3">
                <p className="text-muted flex h-5 items-center gap-2 text-sm">
                  {recording && <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />}
                  {recording
                    ? t.lRecording
                    : voice.state === "transcribing"
                      ? t.pUnderstanding
                      : voice.state === "speaking"
                        ? `${t.speaking}…`
                        : t.lThinking}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={voice.stop}
                    disabled={!recording}
                    aria-label={t.pDoneTalking}
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-white shadow-lg transition-[scale,opacity] duration-160 ease-out active:scale-[0.95] disabled:opacity-40 ${
                      recording ? "bg-red-500" : "bg-accent"
                    }`}
                  >
                    {recording ? <StopIcon /> : <MicIcon />}
                  </button>
                  <input
                    className={field}
                    placeholder={recording ? t.typePh : t.lWait}
                    value={typed}
                    disabled={!recording}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        sendTyped();
                      }
                    }}
                  />
                  <IconBtn
                    label={t.pSend}
                    disabled={!typed.trim() || !recording}
                    onClick={sendTyped}
                  >
                    <SendIcon className="h-4 w-4" />
                  </IconBtn>
                  <button className={`${quiet} shrink-0`} onClick={() => void finish()}>
                    {t.finish}
                  </button>
                </div>
              </div>
            )}
          </div>

          <QuestionChecklist questions={questions} covered={covered} />
        </div>
      )}
    </section>
  );
}

/** The questions Emily must cover, ticked as the interview advances (covered = -1: preview). */
function QuestionChecklist({
  questions,
  covered,
}: {
  questions: { text: string; kind: QuestionKind }[];
  covered: number;
}) {
  const { t } = useLang();
  const done = Math.max(0, Math.min(covered, questions.length));
  return (
    <aside aria-label={t.lQuestions} className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-medium">{t.lQuestions}</h3>
        {covered >= 0 && (
          <span className="text-muted text-xs tabular-nums">
            {t.lCovered(done, questions.length)}
          </span>
        )}
      </div>
      {covered >= 0 && (
        <div className="bg-border h-1.5 overflow-hidden rounded-full">
          <div
            className="bg-accent h-full origin-left rounded-full transition-[scale] duration-500 ease-out"
            style={{ scale: `${questions.length ? done / questions.length : 0} 1` }}
          />
        </div>
      )}
      <ol className="space-y-1.5">
        {questions.map((q, i) => {
          const state =
            covered < 0 ? "pending" : i < done ? "done" : i === done ? "current" : "pending";
          return (
            <li
              key={i}
              className={`flex items-start gap-2.5 rounded-xl px-3 py-2 text-sm transition-[background-color,opacity] duration-300 ease-out ${
                state === "current" ? "bg-accent-soft/70" : ""
              } ${state === "done" ? "opacity-60" : ""}`}
            >
              <span
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums transition-colors duration-300 ${
                  state === "done"
                    ? "bg-accent text-accent-foreground"
                    : state === "current"
                      ? "border-accent text-accent border-2"
                      : "border-border text-muted border"
                }`}
              >
                {state === "done" ? <CheckIcon className="h-3 w-3" /> : i + 1}
              </span>
              <span className="flex-1 leading-snug">
                {q.text}
                <span className="text-muted ml-1.5 text-xs">
                  · {q.kind === "abierta" ? t.open : t.closed}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

const statusStyle: Record<AnswerStatus, string> = {
  completa: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  parcial: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  sin_respuesta: "bg-red-500/15 text-red-700 dark:text-red-300",
};

const toneColor = { ok: "#10b981", mid: "#f59e0b", low: "#ef4444" } as const;

/** % of required information obtained + verdict, objective check and per-question status. */
export function SuccessReport({
  summary,
  onRestart,
  onExit,
}: {
  summary: InterviewSummary;
  onRestart?: () => void;
  onExit?: () => void;
}) {
  const { t } = useLang();
  const pct = coverage(summary.answers);
  const v = verdict(pct);
  const R = 52;
  const C = 2 * Math.PI * R;
  const counts = (s: AnswerStatus) => summary.answers.filter((a) => a.status === s).length;

  return (
    <div className="space-y-6">
      <div className="border-border bg-card grid items-center gap-6 rounded-2xl border p-6 md:grid-cols-[auto_1fr]">
        <div className="relative mx-auto h-36 w-36" role="img" aria-label={t.pctAria(pct)}>
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r={R} fill="none" strokeWidth="10" className="stroke-border" />
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              stroke={toneColor[v.tone]}
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct / 100)}
              className="transition-[stroke-dashoffset] duration-1000 ease-out starting:[stroke-dashoffset:327]"
              style={{ transitionDelay: "150ms" }}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <span>
              <span className="block text-3xl font-semibold tabular-nums">{pct}%</span>
              <span className="text-muted text-xs">{t.infoWord}</span>
            </span>
          </div>
        </div>
        <div className="space-y-3">
          <p className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-3 py-1 text-sm font-semibold text-white"
              style={{ background: toneColor[v.tone] }}
            >
              {t.verdictLabel[v.tone]}
            </span>
            <span className="text-muted text-sm">
              {t.counts(counts("completa"), counts("parcial"), counts("sin_respuesta"))}
            </span>
          </p>
          <p className="leading-relaxed">
            <strong>{summary.objective.met ? t.met : t.notMet}</strong> {summary.objective.reason}
          </p>
          <p className="text-muted text-sm leading-relaxed">{summary.summary}</p>
          {(onRestart || onExit) && (
            <div className="flex flex-wrap gap-3 pt-1">
              {onRestart && (
                <button className={primary} onClick={onRestart}>
                  {t.repeat}
                </button>
              )}
              {onExit && (
                <button className={quiet} onClick={onExit}>
                  {t.back}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <dl className="border-border bg-card divide-border divide-y rounded-2xl border px-6">
          {summary.answers.map((a) => (
            <div key={a.question} className="space-y-1.5 py-4">
              <dt className="flex items-start justify-between gap-3 text-sm">
                <span className="text-muted">{a.question}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[a.status]}`}
                >
                  {t.status[a.status]}
                </span>
              </dt>
              <dd>{a.answer}</dd>
            </div>
          ))}
        </dl>
        <div className="space-y-4">
          <InfoList title={t.keyFacts} items={summary.keyFacts} />
          <InfoList title={t.pains} items={summary.painPoints} />
          <InfoList title={t.insights} items={summary.insights} />
          {(summary.quotes?.length ?? 0) > 0 && (
            <div className="border-border bg-card space-y-3 rounded-2xl border p-6">
              <h3 className="font-semibold">{t.quotes}</h3>
              {summary.quotes.map((q) => (
                <blockquote key={q} className="border-accent border-l-2 pl-3 text-sm italic">
                  “{q}”
                </blockquote>
              ))}
            </div>
          )}
          <InfoList title={t.nextSteps} items={summary.nextSteps} />
        </div>
      </div>
    </div>
  );
}

/** Where the emailed report went (or why it didn't). */
function ReportNotice({ report, to }: { report: ReportStatus | "sending" | null; to: string }) {
  const { t } = useLang();
  if (!to) return null;
  const msg =
    report === "sending"
      ? t.sending(to)
      : report?.sent
        ? t.sent(report.to)
        : report
          ? t.reportReason[report.reason as keyof typeof t.reportReason]
          : "";
  if (!msg) return null;
  const ok = report !== "sending" && !!report?.sent;
  return (
    <p
      role="status"
      className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${
        report === "sending"
          ? "bg-accent-soft/60 text-accent"
          : ok
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "bg-amber-500/10 text-amber-800 dark:text-amber-300"
      }`}
    >
      {report === "sending" ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : ok ? (
        <CheckIcon className="h-4 w-4" />
      ) : null}
      {msg}
    </p>
  );
}

/** Whether the report landed in Notion (silent when Notion isn't configured). */
function NotionNotice({ notion }: { notion: NotionStatus | "saving" | null }) {
  const { t } = useLang();
  if (!notion || (notion !== "saving" && !notion.saved && notion.reason === "not_configured"))
    return null;
  const base = "flex items-center gap-2 rounded-xl px-4 py-3 text-sm";
  if (notion === "saving")
    return (
      <p role="status" className={`${base} bg-accent-soft/60 text-accent`}>
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        {t.notionSaving}
      </p>
    );
  if (notion.saved)
    return (
      <p
        role="status"
        className={`${base} bg-emerald-500/10 text-emerald-700 dark:text-emerald-300`}
      >
        <CheckIcon className="h-4 w-4" /> {t.notionSaved}
        <a href={notion.url} target="_blank" rel="noreferrer" className="font-medium underline">
          {t.notionOpen}
        </a>
      </p>
    );
  return (
    <p role="status" className={`${base} bg-amber-500/10 text-amber-800 dark:text-amber-300`}>
      {notion.reason === "rate_limited" ? t.notionRate : t.notionFail}
    </p>
  );
}

/** A titled list card; renders nothing for empty (or older, missing) lists. */
function InfoList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="border-border bg-card space-y-3 rounded-2xl border p-6">
      <h3 className="font-semibold">{title}</h3>
      <ul className="space-y-2">
        {items.map((x) => (
          <li key={x} className="flex gap-2 text-sm">
            <SparkIcon className="text-accent mt-0.5 h-4 w-4 shrink-0" /> {x}
          </li>
        ))}
      </ul>
    </div>
  );
}
