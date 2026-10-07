"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { translateSummary } from "./ai";
import { DOMAIN } from "@/features/demo/mock";
import { coverage, verdict, voices } from "./config";
import { ArrowRight, CheckIcon, CopyIcon, MicIcon, PlusIcon, SparkIcon, XIcon } from "./icons";
import { dict, useLang, type Lang } from "./i18n";
import { InterviewLive, SuccessReport } from "./interview-live";
import { deleteEmily, saveResultTranslation, type SavedEmily, type SavedResult } from "./store";
import { primary, quiet, type Msg } from "./ui";
import type { OrbMode } from "./voice-orb";

const date = (iso: string, lang: Lang) =>
  iso
    ? new Date(iso).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" })
    : "";
const dateTime = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" });

/** "Mis Emilys": every Emily created in this browser, saved under its project name. */
export function EmilyList({
  emilys,
  results,
  onMode,
  onFeed,
  onCreate,
}: {
  emilys: SavedEmily[];
  results: SavedResult[];
  onMode: (m: OrbMode | null) => void;
  onFeed: (m: Msg[]) => void;
  onCreate: () => void;
}) {
  const { lang, t } = useLang();
  const [testing, setTesting] = useState<SavedEmily | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  if (testing)
    return (
      <InterviewLive
        draft={testing.draft}
        slug={testing.slug}
        onMode={onMode}
        onFeed={onFeed}
        onExit={() => {
          onMode(null);
          onFeed([]);
          setTesting(null);
        }}
      />
    );

  if (!emilys.length)
    return (
      <div className="my-auto max-w-md space-y-4 py-16">
        <h2 className="text-3xl font-semibold tracking-[-0.03em]">{t.noEmilysTitle}</h2>
        <p className="text-muted">{t.noEmilysBody}</p>
        <button className={primary} onClick={onCreate}>
          <PlusIcon className="h-4 w-4" /> {t.firstEmily}
        </button>
      </div>
    );

  async function copy(slug: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/e/${slug}`);
      setCopied(slug);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="space-y-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-semibold tracking-[-0.03em]">{t.myEmilys}</h2>
          <p className="text-muted text-sm">{t.createdHere(emilys.length)}</p>
        </div>
        <button className={primary} onClick={onCreate}>
          <PlusIcon className="h-4 w-4" /> {t.newEmily}
        </button>
      </header>

      <ul className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {emilys.map(({ slug, draft, createdAt }) => {
          const voice = voices.find((v) => v.id === draft.voice);
          const done = results.filter((r) => r.slug === slug).length;
          return (
            <li
              key={slug}
              className="border-border bg-card hover:border-accent/40 flex flex-col gap-4 rounded-2xl border p-5 transition-[border-color,translate] duration-200 ease-out starting:translate-y-2 starting:opacity-0"
            >
              <div className="space-y-1">
                <h3 className="text-lg font-semibold tracking-[-0.01em]">{draft.project}</h3>
                <p className="text-muted line-clamp-2 text-sm">{draft.objective}</p>
              </div>
              <ul className="flex flex-wrap gap-1.5 text-xs">
                {[
                  t.nQuestions(draft.questions.length),
                  dict[draft.locale].langName,
                  voice ? t.chipVoice(`${voice.name} · ${voice.desc[lang]}`) : "",
                  draft.recipientName || draft.company
                    ? t.chipFor([draft.recipientName, draft.company].filter(Boolean).join(" · "))
                    : t.openLinkChip,
                  done ? t.chipInterviews(done) : "",
                  draft.reportEmail ? t.chipReport(draft.reportEmail) : "",
                ]
                  .filter(Boolean)
                  .map((chip) => (
                    <li
                      key={chip}
                      className="bg-accent-soft/70 text-accent rounded-full px-2.5 py-1 font-medium"
                    >
                      {chip}
                    </li>
                  ))}
              </ul>
              <p className="text-muted font-mono text-xs">
                {DOMAIN}/{slug} · {date(createdAt, lang)}
              </p>
              <div className="mt-auto flex flex-wrap gap-2">
                <button
                  className={`${primary} px-4 py-2 text-sm`}
                  onClick={() => setTesting({ slug, draft, createdAt })}
                >
                  <MicIcon className="h-4 w-4" /> {t.test}
                </button>
                <Link href={`/e/${slug}`} target="_blank" className={`${quiet} px-4 py-2`}>
                  {t.openPage} <ArrowRight className="h-4 w-4" />
                </Link>
                <button className={`${quiet} px-4 py-2`} onClick={() => void copy(slug)}>
                  {copied === slug ? (
                    <CheckIcon className="h-4 w-4" />
                  ) : (
                    <CopyIcon className="h-4 w-4" />
                  )}
                  {copied === slug ? t.copied : t.linkWord}
                </button>
                {confirming === slug ? (
                  <button
                    className={`${quiet} border-red-500/40 px-4 py-2 text-red-600 hover:border-red-500 hover:text-red-600 dark:text-red-400`}
                    onClick={() => {
                      deleteEmily(slug);
                      setConfirming(null);
                    }}
                    onBlur={() => setConfirming(null)}
                  >
                    {t.confirmDelete}
                  </button>
                ) : (
                  <button
                    className={`${quiet} px-3 py-2`}
                    aria-label={t.deleteAria(draft.project)}
                    onClick={() => setConfirming(slug)}
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "Resultados": summaries of every interview completed with a saved Emily (newest first). */
export function ResultsList({
  results,
  onCreate,
}: {
  results: SavedResult[];
  onCreate: () => void;
}) {
  const { t } = useLang();
  if (!results.length)
    return (
      <div className="my-auto max-w-md space-y-4 py-16">
        <h2 className="text-3xl font-semibold tracking-[-0.03em]">{t.noResultsTitle}</h2>
        <p className="text-muted">{t.noResultsBody}</p>
        <button className={quiet} onClick={onCreate}>
          {t.goEmilys} <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    );

  return (
    <div className="space-y-6 py-8">
      <header className="space-y-1">
        <h2 className="text-3xl font-semibold tracking-[-0.03em]">{t.results}</h2>
        <p className="text-muted text-sm">{t.nCompleted(results.length)}</p>
      </header>
      <ul className="space-y-4">
        {results.map((r) => (
          <ResultItem key={r.slug + r.at} r={r} />
        ))}
      </ul>
    </div>
  );
}

const inFlight = new Set<string>(); // one translation request per result + language

/**
 * The result's summary in the UI language: the original when the interview was held in it,
 * otherwise an AI translation (requested once, then cached with the result).
 */
function useSummaryIn(r: SavedResult, lang: Lang) {
  const cached = lang === r.locale ? r.summary : r.translations?.[lang];
  const [failed, setFailed] = useState<Lang | null>(null);
  useEffect(() => {
    if (cached || failed === lang) return;
    const key = `${r.slug}|${r.at}|${lang}`;
    if (inFlight.has(key)) return;
    inFlight.add(key);
    translateSummary(r.summary, lang)
      .then((s) => (s ? saveResultTranslation(r.slug, r.at, lang, s) : setFailed(lang)))
      .catch(() => setFailed(lang))
      .finally(() => inFlight.delete(key));
  }, [cached, failed, lang, r.slug, r.at, r.summary]);
  return {
    summary: cached ?? r.summary,
    note: cached ? "" : failed === lang ? dict[lang].resultUntranslated : dict[lang].translating,
  };
}

/** One result, labels and content in the UI language. */
function ResultItem({ r: saved }: { r: SavedResult }) {
  const { lang, t } = useLang();
  const { summary, note } = useSummaryIn(saved, lang);
  const r = { ...saved, summary };
  return (
    <li lang={lang} className="border-border bg-card rounded-2xl border p-5">
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-accent text-xs font-medium">
              {r.project} · {dateTime(r.at, lang)}
            </p>
            <p className="leading-relaxed">{r.summary.summary}</p>
            {note && <p className="text-muted text-xs">{note}</p>}
          </div>
          {r.summary.objective && (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                {
                  ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                  mid: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                  low: "bg-red-500/15 text-red-700 dark:text-red-300",
                }[verdict(coverage(r.summary.answers)).tone]
              }`}
            >
              {coverage(r.summary.answers)}% ·{" "}
              {t.verdictLabel[verdict(coverage(r.summary.answers)).tone]}
            </span>
          )}
          <span className="text-muted text-sm group-open:hidden">{t.seeDetail}</span>
          <span className="text-muted hidden text-sm group-open:inline">{t.hide}</span>
        </summary>
        <div className="mt-5">
          {r.summary.objective ? (
            <SuccessReport summary={r.summary} />
          ) : (
            <div className="grid gap-6 xl:grid-cols-2">
              {r.summary.insights.length > 0 && (
                <ul className="space-y-2">
                  {r.summary.insights.map((x) => (
                    <li key={x} className="flex gap-2 text-sm">
                      <SparkIcon className="text-accent mt-0.5 h-4 w-4 shrink-0" /> {x}
                    </li>
                  ))}
                </ul>
              )}
              <dl className="divide-border divide-y">
                {r.summary.answers.map((a) => (
                  <div key={a.question} className="space-y-1 py-3 first:pt-0">
                    <dt className="text-muted text-sm">{a.question}</dt>
                    <dd className="text-sm">{a.answer}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}
