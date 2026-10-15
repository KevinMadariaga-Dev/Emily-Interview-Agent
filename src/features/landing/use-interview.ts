"use client";

import { useEffect, useRef, useState } from "react";
import {
  aiStatus,
  readAnswer,
  type AnswerRead,
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
import { classifyTimeline, find, flatten, matchAsked, topIndex, wishes } from "./question-tree";
import { saveResult } from "./store";
import { friendlyError, micError } from "./ui";
import { connectRealtime, type RealtimeCall, type RealtimeEvent } from "./realtime-client";
import { realtimeInstructions, realtimeStyle, turnDirective } from "./realtime-prompt";
import { useEmilyVoice, type VoiceState } from "./use-emily-voice";
import type { OrbMode } from "./voice-orb";

/** Milliseconds now (only read inside event handlers, never while rendering). */
const clock = () => Date.now();

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
  /** The saved Emily: the result, email and Notion page are stored under it. */
  slug: string;
  onMode: (m: OrbMode) => void;
}) {
  const [openai, setOpenai] = useState(false);
  // Voice engine: server default (VOICE_ENGINE), overridable with ?engine=realtime|classic (A/B).
  const engine = useRef<"realtime" | "classic">("classic");
  const rt = useRef<RealtimeCall | null>(null);
  const [rtState, setRtState] = useState<VoiceState>("idle");
  const [rtInterim, setRtInterim] = useState("");
  const [realtime, setRealtime] = useState(false); // this session runs on the realtime engine
  const askingRef = useRef(-1);
  const doneRef = useRef(false); // Emily said goodbye: finish once her audio ends
  const replyWatch = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silentReplies = useRef(0); // consecutive tool-only replies (loop guard)
  const nodeRef = useRef<string | null>(null); // id of the question (main or branch) being asked
  const askedTimes = useRef<Record<string, number>>({}); // per question id (follow-ups)
  const clarified = useRef<Set<string>>(new Set()); // yes/no questions she asked to clarify
  const sinceAsked = useRef<string[]>([]); // what the participant said since the main question
  const answeredRef = useRef<Set<string>>(new Set()); // branch questions already answered (read)
  const askedWhen = useRef<Set<string>>(new Set()); // main questions whose "by when" was asked
  const speakingNode = useRef<string | null>(null); // the question the reply being prepared asks
  // What an app-decided turn must end asking, tied to that turn's response (id once created).
  const owedQuestion = useRef<{ text: string; id?: string } | null>(null);
  // Waiting for the intent of a yes/no answer (with branches) before Emily replies.
  const intentWait = useRef<{ timer: ReturnType<typeof setTimeout>; since: number } | null>(null);
  function stopIntentWait() {
    if (intentWait.current) clearTimeout(intentWait.current.timer);
    intentWait.current = null;
  }
  /** The closing, said word for word: thanks, the interview is over, answers recorded. */
  function goodbyeLine() {
    const name = draft.recipientName.trim();
    return draft.locale === "es"
      ? `Eres Emily. Di exactamente esta frase, en español, con calidez, y nada más: "Muchas gracias por tu tiempo${name ? `, ${name}` : ""}. Con esto terminamos la entrevista; tus respuestas quedaron registradas. ¡Que tengas un excelente día!"`
      : `You are Emily. Say exactly this, in English, warmly, and nothing else: "Thank you so much for your time${name ? `, ${name}` : ""}. That's the end of the interview; your answers have been recorded. Have a great day!"`;
  }

  /** After the end of a turn, how long she waits for more before answering (a mid-answer pause). */
  const END_OF_TURN_GRACE_MS = 2_000;

  /** Emily is now asking question `id` (main or branch): progress, card and what to read next. */
  function markAsked(id: string, count = true) {
    if (!find(draft.questions, id)) return;
    if (count) askedTimes.current[id] = (askedTimes.current[id] ?? 0) + 1;
    const i = topIndex(draft.questions, id);
    if (i !== askingRef.current) {
      sinceAsked.current = []; // a new main question: a new answer to read
      answeredRef.current = new Set();
    }
    nodeRef.current = id;
    setNode(id);
    askingRef.current = i;
    setAsking(i);
    setCovered(i);
  }

  /** Emily answers now: with the decided intent, or (none / too slow) deciding it herself. */
  function answerNow(read?: AnswerRead | null) {
    const wait = intentWait.current;
    if (!wait) return;
    // Read early: still give a mid-answer pause its time before answering.
    const left = END_OF_TURN_GRACE_MS - (clock() - wait.since);
    if (left > 0) {
      clearTimeout(wait.timer);
      wait.timer = setTimeout(() => answerNow(read), left);
      return;
    }
    stopIntentWait();
    if (pausedRef.current || ending.current || doneRef.current) return;
    if (!read) return reply(undefined, true); // not read in time: she decides on her own
    // The "by when" of something they want is asked once per main question, and never when
    // their answer already says when ("para antes de diciembre", "ideally next month").
    const all = sinceAsked.current.join(" "); // everything said about this main question
    const key = String(askingRef.current);
    const wants =
      read.wants &&
      !askedWhen.current.has(key) &&
      wishes(sinceAsked.current.at(-1) ?? "") && // a complaint isn't a wish: only "I'd like…"
      classifyTimeline(all) === "unknown"
        ? read.wants
        : null;
    if (wants) askedWhen.current.add(key);
    // Read by the app: one exact instruction, said in one go (no progress call to split it).
    // A follow-up only for a short, vague answer (the reader's sense of "vague" is loose).
    const now = nodeRef.current ? find(draft.questions, nodeRef.current) : undefined;
    const lastAnswer = sinceAsked.current.at(-1) ?? "";
    const vague =
      read.vague && (now?.purpose === "timeline" || lastAnswer.split(/\s+/).length <= 4);
    reply(undefined, true, read.intent ?? undefined, { vague, wants });
    // An unclear yes/no gets one clarification: from now on, still unclear = the safe branch.
    const id = nodeRef.current;
    if (read.intent === "unclear" && id) clarified.current.add(id);
  }
  const introduced = useRef(false); // Emily has spoken at least once
  // Progress when the user's turn ended: an interrupted reply's progress calls are undone.
  const beforeReply = useRef({
    asking: -1,
    node: null as string | null,
    asked: {} as Record<string, number>,
    clarified: [] as string[],
  });
  const markTurn = () =>
    (beforeReply.current = {
      asking: askingRef.current,
      node: nodeRef.current,
      asked: { ...askedTimes.current },
      clarified: [...clarified.current],
    });

  /** Emily's next reply, steered: the script plus what this turn must do. */
  /** `speakOnly`: no tools this time, so she can't answer with just a progress call again. */
  function reply(
    extra?: string,
    speakOnly = false,
    intent?: "yes" | "no" | "unclear",
    read?: { vague: boolean; wants: string | null },
  ) {
    const answered = [...answeredRef.current];
    const id = nodeRef.current;
    let directive =
      extra ??
      turnDirective(
        draft,
        id,
        id ? (askedTimes.current[id] ?? 0) : 0,
        !!id && clarified.current.has(id),
        intent,
        answered,
        read,
      );
    // No main question is ever skipped: before saying goodbye, or before moving on to a later
    // main question, the first one never asked comes first.
    const target = [...new Set(directive.match(/\[(q[\w-]*)\]/g) ?? [])].map((x) => x.slice(1, -1));
    const goodbye = /^(AHORA|NOW): (despídete|say (a warm )?goodbye)/.test(directive);
    const missing = draft.questions.findIndex(
      (m) => !flatten([m]).some((n) => (askedTimes.current[n.q.id] ?? 0) > 0),
    );
    const targetMain = target.length === 1 ? topIndex(draft.questions, target[0]!) : -1;
    if (
      !extra?.includes("decidió terminar") &&
      !extra?.includes("chose to end") &&
      missing >= 0 &&
      id && // the intro asks the first one anyway
      (goodbye || (targetMain > missing && draft.questions[targetMain]?.id === target[0]))
    ) {
      const m = draft.questions[missing]!;
      directive =
        draft.locale === "es"
          ? `AHORA, en UN solo mensaje: empieza con un comentario breve (una frase corta) sobre lo que acaba de responder y haz EXACTAMENTE la pregunta [${m.id}] "${m.text}", casi textual. No hagas ninguna otra.`
          : `NOW, in ONE single message: start with a brief comment (one short sentence) on what they just answered and ask EXACTLY question [${m.id}] "${m.text}", almost word for word. Ask nothing else.`;
    }
    // The one question this reply asks (when the directive names a single one): shown on the
    // card when she starts saying it.
    const named = [...new Set(directive.match(/\[(q[\w-]*)\]/g) ?? [])];
    speakingNode.current = named.length === 1 ? named[0]!.slice(1, -1) : null;
    // A plain goodbye is the app's call: the interview ends once she's heard saying it (no
    // need for her to report it). Other goodbye options still need her progress call.
    const isGoodbye = /^(AHORA|NOW): (despídete|say (a warm )?goodbye)/.test(directive) || !!extra?.match(/decidió terminar|chose to end/);
    if (isGoodbye) {
      doneRef.current = true;
      setCovered(draft.questions.length);
    }
    const noTools = speakOnly && (isGoodbye || !directive.includes("done=true"));
    // A decided turn must end in its question (quoted in the directive): checked when it's done.
    const owed = read ? directive.match(/"([^"]*[?？][^"]*)"/)?.[1] : undefined;
    owedQuestion.current = owed ? { text: owed } : null;
    rt.current?.send({
      type: "response.create",
      response: {
        // A turn the app fully decided gets no question list: nothing else to pick from.
        // The goodbye is a fixed line she just says (asked to improvise one, she kept asking).
        instructions: isGoodbye
          ? goodbyeLine()
          : `${read ? realtimeStyle(draft) : realtimeInstructions(draft, answeredRef.current)}\n\n${directive}`,
        // No tools at all (not just "don't call"): seeing one she can't use, she narrates it.
        ...(noTools && { tool_choice: "none", tools: [] }),
        // Outside the conversation: with the interview in view she'd keep going ("let's move on…").
        ...(isGoodbye && { conversation: "none", input: [] }),
      },
    });
  }

  /**
   * Safety net for semantic turn detection: it answers fast when the idea is clearly finished,
   * but in tests it sometimes committed the user's turn and never started a reply. If nothing
   * starts within REPLY_WATCH_MS (and the user didn't keep talking), ask Emily to answer.
   */
  const REPLY_WATCH_MS = 2_500;
  function watchReply(on: boolean) {
    if (replyWatch.current) clearTimeout(replyWatch.current);
    replyWatch.current = on
      ? setTimeout(() => {
          if (!pausedRef.current && !ending.current && !intentWait.current) reply();
        }, REPLY_WATCH_MS)
      : null;
  }
  const [phase, setPhase] = useState<InterviewPhase>("ready");
  const [history, setHistory] = useState<Turn[]>([]);
  const [covered, setCovered] = useState(0);
  const [asking, setAsking] = useState(-1); // required question on screen (-1: presentation)
  const [node, setNode] = useState<string | null>(null); // the exact question (maybe a branch one)
  const [summary, setSummary] = useState<InterviewSummary | null>(null);
  const [report, setReport] = useState<ReportStatus | "sending" | null>(null);
  const [notion, setNotion] = useState<NotionStatus | "saving" | null>(null);
  const [error, setError] = useState("");
  const voice = useEmilyVoice({ openai, locale: draft.locale, voice: draft.voice, onMode });
  const hist = useRef<Turn[]>([]);
  const alive = useRef(true);
  const ending = useRef(false);
  const pendingTyped = useRef(""); // a typed answer replaces the recording in progress
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const resumeRef = useRef<(() => void) | null>(null); // resolves the wait while paused
  const waitResume = () => new Promise<void>((r) => (resumeRef.current = r));
  const live = () => alive.current && !ending.current;

  /** Emily's line. If paused before or during it, she waits and then says it again. */
  async function sayLine(text: string) {
    do {
      if (pausedRef.current) await waitResume();
      if (!live()) return;
      await voice.say(text);
    } while (pausedRef.current && live());
  }

  useEffect(() => {
    alive.current = true;
    return () => {
      rt.current?.close(); // leaving the page ends the call
    };
  }, []);

  useEffect(() => {
    alive.current = true;
    aiStatus()
      .then((s) => {
        setOpenai(s.voice);
        const forced = new URLSearchParams(window.location.search).get("engine");
        engine.current =
          forced === "realtime" || forced === "classic" ? forced : (s.engine ?? "classic");
      })
      .catch(() => {});
    return () => {
      alive.current = false;
    };
  }, []);

  /** Adds a turn; one speaker twice in a row (an answer completed after an interruption, a
   *  lead-in and its question) becomes one turn, so the transcript always alternates. */
  const push = (t: Turn) => {
    const last = hist.current.at(-1);
    hist.current =
      last?.role === t.role
        ? [...hist.current.slice(0, -1), { ...last, text: `${last.text} ${t.text}` }]
        : [...hist.current, t];
    setHistory(hist.current);
  };

  /** Pauses the conversation: Emily stops talking/listening until `resume()`. */
  function pause() {
    if (phase !== "live" || pausedRef.current) return;
    pausedRef.current = true;
    setPaused(true);
    if (rt.current) {
      // Realtime: mute the mic, silence Emily and drop her reply in progress.
      rt.current.mic.getAudioTracks().forEach((t) => (t.enabled = false));
      rt.current.audio.muted = true;
      rt.current.send({ type: "response.cancel" });
      rt.current.send({ type: "output_audio_buffer.clear" });
    } else voice.cancel();
    onMode("listening");
  }

  function resume() {
    pausedRef.current = false;
    setPaused(false);
    if (rt.current) {
      rt.current.mic.getAudioTracks().forEach((t) => (t.enabled = true));
      rt.current.audio.muted = false;
      reply(
        draft.locale === "es"
          ? "AHORA: el participante pausó y volvió. Repite brevemente tu última pregunta, sin llamar herramientas."
          : "NOW: the participant paused and came back. Briefly repeat your last question, without calling tools.",
        true,
      );
    }
    resumeRef.current?.();
    resumeRef.current = null;
  }

  // ── Realtime engine (speech-to-speech over WebRTC) ────────────────────────────────────────────

  function closeRealtime() {
    watchReply(false);
    stopIntentWait();
    rt.current?.close();
    rt.current = null;
    setRtState("idle");
    setRtInterim("");
  }

  function onRealtimeEvent(e: RealtimeEvent) {
    switch (e.type) {
      case "output_audio_buffer.started":
        setRtState("speaking");
        onMode("speaking");
        // Emily is never cut off: while she speaks (intro, comment, question) the mic is off —
        // the voice server truncates her on any sound otherwise. She only starts after the
        // participant's pause has had its time, so nothing they say is lost.
        rt.current?.mic.getAudioTracks().forEach((t) => (t.enabled = false));
        // The card shows the question she's saying now, from the moment she starts saying it.
        if (speakingNode.current) markAsked(speakingNode.current, false); // counted when generated
        speakingNode.current = null;
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        setRtState("idle");
        onMode("listening");
        if (!pausedRef.current)
          rt.current?.mic.getAudioTracks().forEach((t) => (t.enabled = true));
        if (doneRef.current && !ending.current) void closeInterview(); // after her goodbye is heard
        break;
      case "input_audio_buffer.speech_started":
        watchReply(false); // still talking
        stopIntentWait(); // they keep answering: decide when they're done
        setRtState("recording");
        setRtInterim("");
        onMode("listening");
        break;
      case "input_audio_buffer.speech_stopped":
        setRtState("transcribing");
        watchReply(true);
        break;
      case "input_audio_buffer.committed":
        watchReply(false);
        if (pausedRef.current || ending.current || doneRef.current) break;
        markTurn();
        // Listen, think, then speak. The transcript (it comes right after this) is read first —
        // what a yes/no meant, what's already answered, a vague "by when" — and she answers no
        // sooner than END_OF_TURN_GRACE_MS: a pause mid-answer isn't the end. If they go on
        // talking, this reply never starts and she answers once, to everything they said.
        stopIntentWait();
        intentWait.current = {
          timer: setTimeout(() => answerNow(), 4_500), // no transcript or read: she decides
          since: clock(),
        };
        break;
      case "emily.interrupted": {
        // The user talked over her: that reply never happened. Back to where the turn started, so
        // she answers once, taking in everything they said.
        const { asking: i, node, asked, clarified: c } = beforeReply.current;
        askingRef.current = i;
        nodeRef.current = node;
        askedTimes.current = { ...asked };
        clarified.current = new Set(c);
        setNode(node);
        doneRef.current = false;
        setAsking(i);
        setCovered(Math.max(i, 0));
        break;
      }
      case "response.created":
        watchReply(false); // Emily is answering
        // The decided turn just started: its "must end asking" belongs to this response.
        if (owedQuestion.current && !owedQuestion.current.id)
          owedQuestion.current.id = (e.response as { id?: string })?.id;
        break;
      case "conversation.item.input_audio_transcription.delta":
        setRtInterim((t) => t + String(e.delta ?? ""));
        break;
      case "conversation.item.input_audio_transcription.completed": {
        const text = String(e.transcript ?? "").trim();
        setRtInterim("");
        if (text) push({ role: "participant", text, q: Math.max(askingRef.current, 0) });
        if (text) sinceAsked.current.push(text);
        const wait = intentWait.current;
        if (wait && nodeRef.current) {
          const asked = nodeRef.current;
          void readAnswer(slug, asked, sinceAsked.current.join(" "))
            .catch(() => null)
            .then((read) => {
              if (intentWait.current !== wait) return;
              read?.answered.forEach((id) => answeredRef.current.add(id));
              answerNow(read);
            });
        }
        break;
      }
      case "emily.said": // heard in full (interrupted replies never get here)
        push({ role: "emily", text: String(e.text) });
        break;
      case "response.done": {
        // Progress tool calls: keep the question card in sync, answer them, finish at the end.
        const output = ((e.response as { output?: unknown[] })?.output ?? []) as {
          type: string;
          name?: string;
          call_id?: string;
          arguments?: string;
          content?: { transcript?: string }[];
        }[];
        const said = output
          .flatMap((o) => o.content ?? [])
          .map((c) => c.transcript ?? "")
          .join(" ")
          .trim();
        const calls = output.filter(
          (o) => o.type === "function_call" && o.name === "report_progress",
        );
        let marked = false;
        for (const call of calls) {
          let args: { asking?: string | number; intent?: string; done?: boolean } = {};
          try {
            args = JSON.parse(call.arguments ?? "{}");
          } catch {}
          // The question she asked: what she said decides (she may report one she skipped), else
          // the id she reported (older prompts sent the main question's index).
          const id =
            (!args.done && said && matchAsked(draft.questions, said)) ||
            (typeof args.asking === "number" ? draft.questions[args.asking]?.id : args.asking);
          if (args.intent === "unclear" && nodeRef.current) clarified.current.add(nodeRef.current);
          if (id) markAsked(id);
          marked = true;
          if (args.done) {
            doneRef.current = true;
            setCovered(draft.questions.length);
          }
          rt.current?.send({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: call.call_id, output: "ok" },
          });
        }
        // A reply with no progress call (a continuation, or a turn the app fully decided): what
        // she said still tells which question she's on.
        if (!marked && !doneRef.current && said) {
          const heard = matchAsked(draft.questions, said);
          if (heard) markAsked(heard);
        }
        // An app-decided turn that ended in a comment, without its question: ask it, once.
        const rid = (e.response as { id?: string })?.id;
        const pendingAsk =
          owedQuestion.current?.id && owedQuestion.current.id === rid ? owedQuestion.current.text : null;
        if (pendingAsk) owedQuestion.current = null;
        if (
          pendingAsk &&
          !calls.length &&
          said &&
          !/[?？]/.test(said) &&
          (e.response as { status?: string })?.status === "completed" &&
          !doneRef.current
        )
          reply(
            draft.locale === "es"
              ? `AHORA: sin acuse ni introducción (ya los dijiste), haz esta pregunta, casi textual: "${pendingAsk}"`
              : `NOW: with no acknowledgement or lead-in (you already said them), ask this question, almost word for word: "${pendingAsk}"`,
            true,
          );
        // After a progress call Emily may still owe her line: she spoke a lead-in but not the
        // question yet ("Perfecto, gracias…" + tool call), said nothing, or marked the end
        // before saying goodbye. Let her continue then — not when she already asked (ends in ?).
        // At most 2 continuations in a row, so a confused model can't loop.
        const spoke = output.some((o) => o.type === "message");
        if (spoke) introduced.current = true;
        const asked = /[?？]\s*$/.test(said);
        const owesLine = calls.length > 0 && (doneRef.current ? !spoke : !asked);
        silentReplies.current = owesLine ? silentReplies.current + 1 : 0;
        // The very first call may skip the intro too: then it goes before the question.
        const intro = !introduced.current;
        const now = nodeRef.current ? find(draft.questions, nodeRef.current) : undefined;
        const q = `[${now?.id ?? ""}] "${now?.text ?? ""}"`;
        if (owesLine && silentReplies.current <= 2)
          reply(
            doneRef.current
              ? draft.locale === "es"
                ? "AHORA: despídete en una frase agradeciendo su tiempo."
                : "NOW: say goodbye in one sentence thanking them for their time."
              : draft.locale === "es"
                ? `AHORA: ${intro ? "preséntate con calma (eres Emily, entrevistadora con IA de NEOera), explica en una o dos frases claras el objetivo de la entrevista y cuántas preguntas serán, y luego " : "sin acuse ni introducción (ya los dijiste), "}di en voz alta, casi textual, la pregunta ${q}.`
                : `NOW: ${intro ? "calmly introduce yourself (you're Emily, an AI interviewer from NEOera), explain in one or two clear sentences the goal of the interview and how many questions there are, then " : "with no acknowledgement or lead-in (you already said them), "}say out loud, almost word for word, question ${q}.`,
            true,
          );
        if (doneRef.current && !ending.current) {
          // Fallback if the "audio stopped" event never arrives after the goodbye.
          setTimeout(
            () => doneRef.current && !ending.current && void closeInterview(),
            spoke ? 12_000 : 20_000,
          );
        }
        break;
      }
      case "error":
        console.warn("[emily realtime]", e.error);
        break;
    }
  }

  /** Starts the realtime call; false if it couldn't (the classic engine takes over). */
  async function startRealtime(): Promise<boolean> {
    try {
      const res = await fetch("/api/voice/realtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) throw new Error(`realtime-session ${res.status}`);
      const { clientSecret } = (await res.json()) as { clientSecret: string };
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("mic-unavailable");
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      // No barge-in: Emily's intro and questions are always heard whole.
      rt.current = await connectRealtime({
        clientSecret,
        mic,
        onEvent: onRealtimeEvent,
        bargeIn: false,
      });
      if (!alive.current) return (closeRealtime(), true);
      setRealtime(true);
      reply(undefined, true); // Emily opens: introduction + first question
      return true;
    } catch (err) {
      closeRealtime();
      // A microphone problem would break the classic engine too: explain it instead.
      const id = err instanceof Error ? `${err.name} ${err.message}` : String(err);
      if (/NotAllowed|NotFound|NotReadable|Security|mic-unavailable/.test(id)) {
        setError(micError(err, draft.locale));
        onMode("listening");
        return true;
      }
      console.warn("[emily realtime] falling back to classic:", id);
      return false;
    }
  }

  /**
   * "Finish": Emily says goodbye first (in the realtime call), and once it's heard the interview
   * is closed and saved. Without a live call (classic engine) it closes right away.
   */
  async function finish() {
    if (ending.current) return;
    if (rt.current && !doneRef.current && phase === "live") {
      if (pausedRef.current) resume();
      stopIntentWait();
      reply(
        draft.locale === "es"
          ? "AHORA: el participante decidió terminar la entrevista aquí. Despídete con calidez en una o dos frases: agradece su tiempo, di que sus respuestas quedaron registradas y deséale un buen día. No hagas más preguntas."
          : "NOW: the participant chose to end the interview here. Say a warm goodbye in one or two sentences: thank them for their time, say their answers were recorded and wish them a good day. Ask nothing else.",
        true,
      );
      // If "her goodbye ended" never arrives, close anyway.
      setTimeout(() => !ending.current && void closeInterview(), 15_000);
      return;
    }
    return closeInterview();
  }

  /** Closes the interview: summary, then saved in the database, then emailed and sent to Notion. */
  async function closeInterview() {
    if (ending.current) return;
    if (pausedRef.current) resume();
    ending.current = true;
    closeRealtime();
    voice.cancel();
    setPhase("summarizing");
    onMode("speaking");
    try {
      const result = await summarizeInterview(slug, hist.current);
      setSummary(result);
      const answered = hist.current.some((t) => t.role === "participant");
      // First the database (the record of the interview), then the email and Notion copies.
      if (answered)
        await saveResult(slug, result, hist.current).catch((err) =>
          setError(
            friendlyError(
              err,
              draft.locale === "es"
                ? "No pude guardar el resultado."
                : "I couldn't save the result.",
            ),
          ),
        );
      // Email the report (Gmail/Resend) to the Emily's report address; never blocks the ending.
      // Same report into Notion (skipped server-side when Notion isn't configured).
      if (answered) {
        setNotion("saving");
        saveInterviewToNotion(slug, result, hist.current)
          .then(setNotion)
          .catch(() => setNotion({ saved: false, reason: "failed" }));
      }
      if (answered && draft.reportEmail) {
        setReport("sending");
        sendInterviewReport(slug, result, hist.current)
          .then(setReport)
          .catch(() => setReport({ sent: false, reason: "failed" }));
      }
    } catch (err) {
      setError(
        friendlyError(
          err,
          draft.locale === "es" ? "No pude generar el resumen." : "I couldn't create the summary.",
        ),
      );
    } finally {
      setPhase("done");
      onMode("listening");
    }
  }

  async function run() {
    voice.unlock(); // still inside the "Comenzar" click
    setPhase("live");
    setError("");
    if (engine.current === "realtime" && (await startRealtime())) return;
    let silences = 0;
    try {
      while (alive.current && !ending.current) {
        const next = await withTimeout(interviewTurn(slug, hist.current), 30_000);
        if (!alive.current || ending.current) return;
        setCovered(next.covered);
        setAsking(next.asking);
        push({ role: "emily", text: next.say });
        await sayLine(next.say);
        if (next.done) return void (await finish());
        if (next.asking < 0) continue; // presentation: no answer expected, go to question 1

        let answer = "";
        while (!answer && alive.current && !ending.current) {
          answer = await voice.listen();
          if (pendingTyped.current) {
            answer = pendingTyped.current;
            pendingTyped.current = "";
          }
          if (pausedRef.current) {
            answer = ""; // paused while answering: after "Resume" she repeats the question
            await sayLine(next.say);
            continue;
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
        if (answer) push({ role: "participant", text: answer, q: next.asking });
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message === "timeout"
          ? draft.locale === "es"
            ? "Emily tardó demasiado en responder. Revisa tu conexión y vuelve a intentarlo."
            : "Emily took too long to answer. Check your connection and try again."
          : micError(err, draft.locale),
      );
      onMode("listening");
    }
  }

  /** Answer by text instead of voice (only while Emily is listening). */
  function answerTyped(text: string) {
    if (rt.current) {
      if (!text.trim()) return false;
      rt.current.interrupt(); // a typed answer takes the turn like speech does
      markTurn();
      rt.current.send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: text.trim() }],
        },
      });
      reply();
      push({ role: "participant", text: text.trim(), q: Math.max(askingRef.current, 0) });
      return true;
    }
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
    pausedRef.current = false;
    setPaused(false);
    askingRef.current = -1;
    doneRef.current = false;
    silentReplies.current = 0;
    askedTimes.current = {};
    nodeRef.current = null;
    clarified.current = new Set();
    sinceAsked.current = [];
    answeredRef.current = new Set();
    askedWhen.current = new Set();
    stopIntentWait();
    setNode(null);
    introduced.current = false;
    beforeReply.current = { asking: -1, node: null, asked: {}, clarified: [] };
    setRealtime(false);
    setPhase("ready");
  }

  function stopAll() {
    alive.current = false;
    closeRealtime();
    voice.cancel();
    resumeRef.current?.(); // free a loop waiting on "Resume"
  }

  return {
    openai,
    phase,
    history,
    covered,
    asking,
    /** The exact question being asked now (a branch question while inside a branch). */
    question: node ? find(draft.questions, node) : undefined,
    summary,
    report,
    notion,
    error,
    // The UI reads the same voice shape from either engine.
    voice: realtime
      ? {
          ...voice,
          state: rtState,
          interim: rtInterim,
          // "Done answering": end the user's turn now.
          stop: () => rt.current?.send({ type: "input_audio_buffer.commit" }), // → committed → reply
        }
      : voice,
    realtime,
    paused,
    pause,
    resume,
    run,
    finish,
    answerTyped,
    restart,
    stopAll,
  };
}
