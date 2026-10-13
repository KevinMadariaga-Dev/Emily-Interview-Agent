"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { splitSentences } from "./config";
import { meter, publishLevel, turnDetector } from "./voice-level";
import type { OrbMode } from "./voice-orb";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
const browserRecognition = () => {
  const w = window as unknown as Record<string, (new () => Recognition) | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export type VoiceState = "idle" | "preparing" | "speaking" | "recording" | "transcribing";

// Hands-free turn taking. The mic's ambient level is measured for CALIBRATE_MS when it opens and
// the speech/silence thresholds adapt to the room (a noisy room never "goes silent" at a fixed
// level). After SILENCE_MS of quiet once the user spoke, Emily takes her turn. Tuning knobs:
const CALIBRATE_MS = 350;
const MIN_SPEECH = 0.08; // floor for "the user is talking"
const SPEECH_X = 2.5; // × ambient level
// Anything below the speech level counts as quiet (background noise included): once the user has
// talked, SILENCE_MS without voice ends the turn and Emily processes what she heard.
const SILENCE_MS = 3_000;
const MIN_SPEECH_MS = 250; // voice needed before it counts as an answer (a click or cough doesn't)
const MAX_TURN_MS = 60_000;
// Barge-in while Emily talks: the user's voice must stay above BARGE_LEVEL for BARGE_MS (after a
// short grace period, so her first syllables' echo doesn't trigger it).
const BARGE_LEVEL = 0.2;
const BARGE_MS = 450;
const BARGE_GRACE_MS = 700;
// Each sentence's audio must arrive within this (normally 1–3 s); a stalled request is retried.
const SPEAK_TIMEOUT_MS = 8_000;
// Recording formats by preference: Chrome/Firefox/Android → webm/opus, Safari/iPhone → mp4.
const RECORDING_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];
const recordingType = () =>
  RECORDING_TYPES.find(
    (t) => typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(t),
  );

const MIC: MediaTrackConstraints = {
  echoCancellation: true, // keeps Emily's own voice out of the mic
  noiseSuppression: true,
  autoGainControl: true,
};

let ctx: AudioContext | null = null;
const audioContext = () => {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
};

/**
 * Emily's mouth and ears.
 * - `openai`: speaks via /api/voice/speak and transcribes via /api/voice/transcribe.
 * - otherwise (or on failure): browser speechSynthesis / SpeechRecognition.
 * Publishes the live audio level so the orb moves with whoever is talking.
 */
export function useEmilyVoice({
  openai,
  locale,
  voice,
  onMode,
}: {
  openai: boolean;
  locale: "es" | "en";
  voice?: string;
  onMode: (m: OrbMode) => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [interim, setInterim] = useState("");
  const player = useRef<HTMLAudioElement | null>(null);
  const endTurn = useRef<(() => void) | null>(null); // stops the current recording
  const abortTurn = useRef<(() => void) | null>(null); // stops it and discards the audio
  const cancelled = useRef(false); // cancel() during a line: don't play it (or its fallback)
  const inFlight = useRef(new Set<AbortController>()); // voice requests in flight (incl. prefetch)
  const micStream = useRef<MediaStream | null>(null); // one mic stream per conversation, reused
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The microphone, opened once and reused for every turn and for barge-in listening: reopening it
   * each turn re-prompts on some browsers and fails on some Android phones ("Could not start
   * audio source"). Reopened only if the track ended (device change, phone call…).
   */
  async function getMic() {
    // A new turn right after cancel(): keep the mic instead of the pending release.
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    releaseTimer.current = null;
    const s = micStream.current;
    if (s?.active && s.getAudioTracks().every((t) => t.readyState === "live")) return s;
    // No mediaDevices: page not on HTTPS, or an in-app browser (WhatsApp, Instagram…).
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("mic-unavailable");
    micStream.current = await navigator.mediaDevices.getUserMedia({ audio: MIC });
    return micStream.current;
  }

  /** Turns the microphone off (the browser's recording indicator goes away). */
  const releaseMic = useCallback(() => {
    micStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current = null;
  }, []);

  /** The audio graph must be running to measure the level (iOS suspends it after calls/app switches). */
  const awakeAudio = async () => {
    const ac = audioContext();
    if (ac.state !== "running") await ac.resume().catch(() => {});
    return ac;
  };

  const set = useCallback(
    (s: VoiceState) => {
      setState(s);
      onMode(s === "speaking" ? "speaking" : "listening");
    },
    [onMode],
  );

  // speechSynthesis exposes no audio stream: animate the orb with a synthetic talking level.
  const speakBrowser = (text: string, onAudible: () => void) =>
    new Promise<void>((resolve) => {
      if (typeof speechSynthesis === "undefined") return resolve();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = locale === "es" ? "es-MX" : "en-US";
      let raf = 0;
      const t0 = performance.now();
      const fake = () => {
        const t = (performance.now() - t0) / 1000;
        publishLevel(0.35 + 0.3 * Math.abs(Math.sin(t * 7)) * Math.abs(Math.sin(t * 2.3)));
        raf = requestAnimationFrame(fake);
      };
      u.onstart = () => {
        onAudible();
        raf = requestAnimationFrame(fake);
      };
      const end = () => {
        clearTimeout(guard);
        cancelAnimationFrame(raf);
        publishLevel(0);
        resolve();
      };
      u.onend = u.onerror = end;
      // Chrome sometimes drops an utterance without any event: never wait on it forever.
      const guard = setTimeout(end, 5_000 + text.length * 90);
      speechSynthesis.speak(u);
    });

  /**
   * Speaks a line, always in Emily's OpenAI voice (never the browser's, unless the server has no
   * OpenAI key at all). The line is split into sentences: the first sounds sooner, the next one is
   * generated while the current plays, and a stalled request is retried for that short piece only.
   * State is "preparing" until sound actually plays, so the UI never says "speaking" over silence.
   * With `interruptible`, the mic listens while she is audible: if the user talks over her she
   * stops, and the promise resolves `true` (interrupted).
   */
  async function say(text: string, { interruptible = false } = {}): Promise<boolean> {
    set("preparing");
    cancelled.current = false;
    let interrupted = false;
    let finished = false;
    let watching = false;
    let stopWatch = () => {};
    const stopped = () => interrupted || cancelled.current;
    const onAudible = () => {
      set("speaking");
      if (!interruptible || watching) return;
      watching = true;
      void watchBargeIn(() => {
        interrupted = true;
        player.current?.pause(); // → the clip's "pause" ends the wait
        if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
      }).then((stop) => (finished ? stop() : (stopWatch = stop)));
    };
    try {
      const result = await speakOpenAi(text, onAudible, stopped);
      if (result === "no-key" && !stopped()) await speakBrowser(text, onAudible);
    } finally {
      finished = true;
      if (interrupted) inFlight.current.forEach((c) => c.abort()); // drop prefetched sentences
      stopWatch();
      player.current = null;
      set("idle");
    }
    return interrupted;
  }

  /** One sentence's audio from the server: up to 3 attempts of SPEAK_TIMEOUT_MS each. */
  async function fetchClip(text: string): Promise<Blob | "no-key" | null> {
    for (let attempt = 0; attempt < 3 && !cancelled.current; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 400 * attempt));
      const ctrl = new AbortController();
      inFlight.current.add(ctrl);
      const timer = setTimeout(() => ctrl.abort(), SPEAK_TIMEOUT_MS);
      try {
        const res = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, language: locale, voice }),
          signal: ctrl.signal,
        });
        if (res.status === 503) return "no-key"; // no OpenAI key on the server
        if (res.ok) return await res.blob();
        if (res.status === 429 || res.status === 400) return null; // retrying won't help
      } catch {
        /* timeout or network: try again */
      } finally {
        clearTimeout(timer);
        inFlight.current.delete(ctrl);
      }
    }
    return null;
  }

  /** Plays the line sentence by sentence in the OpenAI voice, prefetching the next one. */
  async function speakOpenAi(
    text: string,
    onAudible: () => void,
    stopped: () => boolean,
  ): Promise<"done" | "no-key"> {
    const parts = splitSentences(text);
    // Each chunk is fetched and its <audio> preloaded ahead: the next one starts with no gap.
    const clips: Promise<{ a: HTMLAudioElement; url: string } | "no-key" | null>[] = [];
    const clip = (i: number) =>
      (clips[i] ??= fetchClip(parts[i]!).then((blob) => {
        if (!(blob instanceof Blob)) return blob;
        const url = URL.createObjectURL(blob);
        const a = new Audio(url);
        a.preload = "auto";
        a.load();
        return { a, url };
      }));
    for (let i = 0; i < parts.length; i++) {
      const audio = await clip(i);
      if (stopped()) return "done";
      if (audio === "no-key") return "no-key";
      if (i + 1 < parts.length) void clip(i + 1); // generated while this one plays
      // A piece that never arrived is skipped (it's on screen): a different voice would be worse.
      if (!audio) continue;
      try {
        await playClip(audio.a, parts[i]!, onAudible);
      } finally {
        URL.revokeObjectURL(audio.url);
      }
      if (stopped()) return "done";
    }
    return "done";
  }

  function playClip(a: HTMLAudioElement, text: string, onAudible: () => void) {
    return new Promise<boolean>((resolve) => {
      player.current = a;
      // Route through the analyser only if the AudioContext is running: a media element wired
      // into a suspended context plays no sound.
      const ac = audioContext();
      let stopMeter = () => publishLevel(0);
      if (ac.state === "running") {
        const analyser = ac.createAnalyser();
        analyser.fftSize = 1024;
        ac.createMediaElementSource(a).connect(analyser).connect(ac.destination);
        stopMeter = meter(analyser);
      }
      let started = false;
      let settled = false;
      const done = (heard: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        stopMeter();
        resolve(heard);
      };
      // Safety net: never wait forever on a stalled clip (not heard → browser voice).
      const guard = setTimeout(() => done(started), 15_000 + text.length * 120);
      const onMeta = () => {
        clearTimeout(guard);
        setTimeout(() => done(started), (a.duration || 30) * 1000 + 2_000);
      };
      // A preloaded clip may already have its metadata.
      if (a.readyState >= HTMLMediaElement.HAVE_METADATA) onMeta();
      else a.onloadedmetadata = onMeta;
      a.onplaying = () => {
        if (started) return;
        started = true;
        onAudible();
      };
      a.onended = a.onpause = () => done(true);
      a.onerror = () => done(started);
      a.play().catch(async () => {
        // Autoplay blocked (e.g. the audio context fell asleep): wake it and try once more.
        try {
          await audioContext().resume();
          await a.play();
        } catch {
          done(false);
        }
      });
    });
  }

  /** Listens in the background (no orb, no recording) and calls `onSpeech` once the user talks. */
  async function watchBargeIn(onSpeech: () => void) {
    let stream: MediaStream;
    try {
      stream = await getMic();
    } catch {
      return () => {}; // no mic (permission, device, insecure page): Emily just can't be interrupted
    }
    const ac = await awakeAudio();
    const analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    const source = ac.createMediaStreamSource(stream);
    source.connect(analyser);
    const t0 = performance.now();
    let loudSince = 0;
    let fired = false;
    const stopMeter = meter(
      analyser,
      (level) => {
        const now = performance.now();
        if (fired || now - t0 < BARGE_GRACE_MS) return;
        if (level < BARGE_LEVEL) return void (loudSince = 0);
        loudSince ||= now;
        if (now - loudSince > BARGE_MS) {
          fired = true;
          onSpeech();
        }
      },
      false,
    );
    return () => {
      stopMeter();
      source.disconnect(); // the stream stays open for the next turn
    };
  }

  /** Records one turn; resolves with the transcript when the user stops talking (or `stop()`). */
  async function listen(): Promise<string> {
    setInterim("");
    if (openai && typeof MediaRecorder !== "undefined") return listenOpenAi();
    return listenBrowser();
  }

  async function listenOpenAi(): Promise<string> {
    const stream = await getMic();
    const type = recordingType();
    const rec = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    const ac = await awakeAudio();
    const analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    const source = ac.createMediaStreamSource(stream);
    source.connect(analyser);

    let discard = false;
    const turn = turnDetector({
      calibrateMs: CALIBRATE_MS,
      minSpeech: MIN_SPEECH,
      speechX: SPEECH_X,
      silenceMs: SILENCE_MS,
      minSpeechMs: MIN_SPEECH_MS,
    });
    const stopMeter = meter(analyser, (level) => {
      if (turn.frame(level, performance.now()) && rec.state === "recording") rec.stop();
    });
    const maxTimer = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_TURN_MS);
    endTurn.current = () => rec.state === "recording" && rec.stop();
    abortTurn.current = () => {
      discard = true;
      if (rec.state === "recording") rec.stop();
    };

    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.start();
    set("recording");
    await stopped;

    clearTimeout(maxTimer);
    stopMeter();
    source.disconnect(); // the stream stays open for the next turn
    endTurn.current = abortTurn.current = null;
    if (discard || !turn.spoke()) {
      set("idle");
      return "";
    }

    set("transcribing");
    try {
      const form = new FormData();
      // The real container type (Safari may report "" → use the one we asked for).
      const blobType = (rec.mimeType || type || "audio/webm").split(";")[0]!;
      form.append("audio", new Blob(chunks, { type: blobType }));
      form.append("language", locale);
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
      if (!res.ok) throw new Error(`transcribe ${res.status}`);
      return ((await res.json()) as { text: string }).text.trim();
    } finally {
      set("idle");
    }
  }

  function listenBrowser(): Promise<string> {
    const Rec = browserRecognition();
    if (!Rec) throw new Error("no-dictation"); // explained by micError() in the user's language
    return new Promise((resolve, reject) => {
      const r = new Rec();
      r.lang = locale === "es" ? "es-MX" : "en-US";
      // Continuous: we end the turn ourselves after SILENCE_MS without new words (same as above).
      r.continuous = true;
      r.interimResults = true;
      let heard = "";
      let discard = false;
      let quiet = 0;
      const maxTimer = setTimeout(() => r.stop(), MAX_TURN_MS);
      r.onresult = (e) => {
        heard = "";
        for (let i = 0; i < e.results.length; i++) heard += e.results[i]![0]!.transcript;
        setInterim(heard);
        publishLevel(0.5);
        setTimeout(() => publishLevel(0), 120);
        clearTimeout(quiet);
        quiet = window.setTimeout(() => r.stop(), SILENCE_MS);
      };
      r.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed")
          reject(Object.assign(new Error("NotAllowedError"), { name: "NotAllowedError" }));
        else if (e.error === "audio-capture")
          reject(Object.assign(new Error("NotFoundError"), { name: "NotFoundError" }));
      };
      r.onend = () => {
        clearTimeout(quiet);
        clearTimeout(maxTimer);
        endTurn.current = abortTurn.current = null;
        set("idle");
        resolve(discard ? "" : heard.trim());
      };
      endTurn.current = () => r.stop();
      abortTurn.current = () => {
        discard = true;
        r.abort();
      };
      r.start();
      set("recording");
    });
  }

  /** Call synchronously inside a click: browsers only allow audio started from a user gesture. */
  const unlock = useCallback(() => {
    audioContext();
  }, []);

  /** Ends the current recording now (the pending `listen()` resolves with what was said). */
  const stop = useCallback(() => endTurn.current?.(), []);

  /** Silences Emily, drops any recording in progress and turns the microphone off. */
  const cancel = useCallback(() => {
    cancelled.current = true;
    inFlight.current.forEach((c) => c.abort());
    player.current?.pause();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    abortTurn.current?.();
    publishLevel(0);
    // The recorder's onstop still needs the tracks for a moment: release right after (unless a
    // new turn grabs the mic first — see getMic).
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    releaseTimer.current = setTimeout(releaseMic, 300);
  }, [releaseMic]);

  useEffect(() => cancel, [cancel]);

  return { state, interim, say, listen, stop, cancel, unlock };
}
