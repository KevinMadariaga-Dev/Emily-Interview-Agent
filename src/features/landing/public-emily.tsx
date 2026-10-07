"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Draft } from "./config";
import { dict } from "./i18n";
import { MicIcon, SendIcon, StopIcon } from "./icons";
import { loadEmily } from "./store";
import { useInterviewSession } from "./use-interview";
import { VoiceOrb, type OrbMode } from "./voice-orb";

/** What the participant opens at /e/<slug>. Loads the Emily saved in this browser. */
export function PublicEmily({ slug }: { slug: string }) {
  const [draft, setDraft] = useState<Draft | null | undefined>(undefined); // undefined = loading
  const t = dict[draft?.locale ?? "es"];

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read-once from browser storage
    setDraft(loadEmily(slug));
  }, [slug]);

  return (
    <main
      lang={draft?.locale ?? "es"}
      className="bg-accent-deep relative flex min-h-dvh flex-col overflow-hidden text-white"
    >
      <header className="flex items-center justify-between gap-4 px-6 py-5 md:px-10">
        <p className="text-sm font-semibold tracking-[0.3em] uppercase">
          NEO<span className="text-violet-300">era</span>
        </p>
        {draft && <p className="truncate text-sm text-violet-200">{draft.project}</p>}
      </header>
      {draft === undefined ? null : draft ? (
        <VoiceStage draft={draft} slug={slug} />
      ) : (
        <section className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <VoiceOrb mode="listening" />
          <h1 className="text-3xl font-semibold tracking-[-0.03em]">{t.pNotHere}</h1>
          <p className="max-w-md text-violet-200">{t.pNotHereBody}</p>
          <Link href="/" className={light}>
            {t.pCreate}
          </Link>
        </section>
      )}
    </main>
  );
}

const light =
  "inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-[15px] font-semibold text-accent-deep shadow-[0_12px_32px_-12px_rgb(0_0_0/0.6)] transition-[translate,scale,opacity] duration-160 ease-out hover:-translate-y-px active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";
const ghost =
  "inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-violet-100 transition-[background-color,scale] duration-160 ease-out hover:bg-white/10 active:scale-[0.97] disabled:opacity-40";

/**
 * Voice-first interview: Emily centered and alive (speaking/listening), her current line as a
 * subtitle, the participant's words under it, progress dots, and the summary at the end.
 */
function VoiceStage({ draft, slug }: { draft: Draft; slug: string }) {
  const [mode, setMode] = useState<OrbMode>("listening");
  const [consent, setConsent] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const s = useInterviewSession({ draft, slug, onMode: setMode });
  const t = dict[draft.locale];
  const { phase, voice, history, asking } = s;
  const total = draft.questions.length;
  const current = asking >= 0 ? draft.questions[asking] : undefined;
  const lastYou = [...history].reverse().find((t) => t.role === "participant")?.text ?? "";
  const recording = voice.state === "recording";

  const status =
    phase === "ready"
      ? t.pReady
      : phase === "summarizing"
        ? t.pSaving
        : voice.state === "speaking"
          ? t.speaking
          : recording
            ? t.pListening
            : voice.state === "transcribing"
              ? t.pUnderstanding
              : t.pThinking;
  const tone =
    voice.state === "speaking" || phase === "summarizing"
      ? "bg-fuchsia-300"
      : recording
        ? "bg-emerald-300"
        : "bg-violet-300";

  // The participant only gets a thank-you; the graded summary is saved for the team.
  if (phase === "done")
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-12 text-center">
        <VoiceOrb mode="listening" />
        <h1 className="animate-rise text-4xl font-semibold tracking-[-0.03em] md:text-5xl">
          {t.pThanks(draft.recipientName)}
        </h1>
        <p
          className="animate-rise max-w-md text-lg text-balance text-violet-200"
          style={{ animationDelay: "80ms" }}
        >
          {s.error ? t.pSaveError : t.pSaved}
        </p>
      </section>
    );

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-7 px-6 pb-10 text-center">
      <VoiceOrb mode={phase === "ready" ? "listening" : mode} />

      <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm font-medium text-violet-100 backdrop-blur">
        <span className="relative flex h-2 w-2">
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${tone}`}
          />
          <span className={`relative inline-flex h-2 w-2 rounded-full ${tone}`} />
        </span>
        <span key={status} className="animate-rise">
          {status}
        </span>
      </span>

      {phase === "ready" ? (
        <div className="max-w-xl space-y-6">
          <h1 className="text-4xl font-semibold tracking-[-0.03em] text-balance md:text-5xl">
            {t.pHello(draft.recipientName)}
          </h1>
          <p className="text-lg text-balance text-violet-200">{t.pIntro(total, draft.project)}</p>
          <label className="mx-auto flex max-w-md items-start gap-3 text-left text-sm text-violet-100">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-white"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            {t.pConsent}
          </label>
          <button className={light} disabled={!consent} onClick={() => void s.run()}>
            <MicIcon className="h-5 w-5" /> {t.pStart}
          </button>
          <p className="text-xs text-violet-300">
            {s.openai ? t.pOpenai : t.pBrowser} {t.pMic}
          </p>
        </div>
      ) : (
        <>
          {current ? (
            <div
              key={asking}
              aria-live="polite"
              className="animate-rise w-full max-w-3xl rounded-3xl border border-white/20 bg-white/10 px-8 py-7 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.6)] ring-1 ring-fuchsia-300/30 backdrop-blur"
            >
              <p className="text-sm font-medium tracking-wide text-violet-200 tabular-nums">
                {t.pQuestionOf(asking + 1, total)}
              </p>
              <p className="mt-2 text-2xl leading-snug font-semibold tracking-[-0.01em] text-balance md:text-3xl">
                {current.text}
              </p>
            </div>
          ) : (
            <p
              aria-live="polite"
              className="animate-rise max-w-xl text-2xl font-medium text-balance"
            >
              {phase === "summarizing" ? t.pMoment : t.pHelloLong(draft.recipientName)}
            </p>
          )}
          <p className="min-h-6 max-w-2xl text-violet-200 italic">
            {recording && voice.interim
              ? voice.interim
              : !recording && lastYou
                ? `“${lastYou}”`
                : ""}
          </p>

          {total > 0 && (
            <div
              className="flex items-center gap-1.5"
              role="img"
              aria-label={t.pQuestionOf(Math.max(asking + 1, 0), total)}
            >
              {draft.questions.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out ${
                    i < asking
                      ? "w-6 bg-white"
                      : i === asking
                        ? "w-6 bg-fuchsia-300"
                        : "w-3 bg-white/20"
                  }`}
                />
              ))}
            </div>
          )}

          {s.error && (
            <p role="alert" className="max-w-md text-sm text-red-200">
              {s.error}
            </p>
          )}

          {phase === "live" && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={voice.stop}
                  disabled={!recording}
                  aria-label={t.pDoneTalking}
                  className={`grid h-14 w-14 place-items-center rounded-full shadow-lg transition-[scale,background-color,opacity] duration-160 ease-out active:scale-[0.95] disabled:opacity-40 ${
                    recording ? "bg-white text-red-500" : "bg-white/15 text-white"
                  }`}
                >
                  {recording ? <StopIcon /> : <MicIcon />}
                </button>
                <button className={ghost} onClick={() => setTyping((t) => !t)}>
                  {typing ? t.pHideKb : t.pTypeAnswer}
                </button>
                <button className={ghost} onClick={() => void s.finish()}>
                  {t.finish}
                </button>
              </div>
              {typing && (
                <form
                  className="flex w-full max-w-lg items-center gap-2 transition-[opacity,translate] duration-200 ease-out starting:translate-y-1 starting:opacity-0"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (s.answerTyped(typed)) setTyped("");
                  }}
                >
                  <input
                    className="w-full rounded-full border border-white/20 bg-white/10 px-5 py-3 text-white placeholder:text-violet-300 focus:border-white/60 focus:outline-none"
                    placeholder={recording ? t.pTypePh : t.pWaitPh}
                    value={typed}
                    disabled={!recording}
                    onChange={(e) => setTyped(e.target.value)}
                    autoFocus
                  />
                  <button
                    aria-label={t.pSend}
                    disabled={!recording || !typed.trim()}
                    className="text-accent-deep grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white disabled:opacity-40"
                  >
                    <SendIcon className="h-4 w-4" />
                  </button>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
