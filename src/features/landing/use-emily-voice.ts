"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { meter, publishLevel } from "./voice-level";
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

export type VoiceState = "idle" | "speaking" | "recording" | "transcribing";

// Hands-free turn taking: stop recording after this much silence once the user has spoken.
const SPEECH_LEVEL = 0.1;
const SILENCE_LEVEL = 0.05;
const SILENCE_MS = 1500;
const MAX_TURN_MS = 60_000;

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

  const set = useCallback(
    (s: VoiceState) => {
      setState(s);
      onMode(s === "speaking" ? "speaking" : "listening");
    },
    [onMode],
  );

  // speechSynthesis exposes no audio stream: animate the orb with a synthetic talking level.
  const speakBrowser = (text: string) =>
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
      u.onstart = () => (raf = requestAnimationFrame(fake));
      u.onend = u.onerror = () => {
        cancelAnimationFrame(raf);
        publishLevel(0);
        resolve();
      };
      speechSynthesis.speak(u);
    });

  async function say(text: string) {
    set("speaking");
    try {
      // Same voice every time: retry OpenAI once instead of switching to the browser's voice.
      const speak = () =>
        fetch("/api/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, language: locale, voice }),
        });
      let res = await speak();
      if (res.status === 503) throw new Error("no-openai"); // no key on the server → browser voice
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 700));
        res = await speak();
      }
      if (!res.ok) throw new Error(`speak ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      let blocked = false;
      await new Promise<void>((resolve) => {
        const a = new Audio(url);
        player.current = a;
        // Route through the analyser only if the AudioContext is running: a media element wired
        // into a suspended context never plays (and never fires "ended").
        const ac = audioContext();
        let stopMeter = () => publishLevel(0);
        if (ac.state === "running") {
          const analyser = ac.createAnalyser();
          analyser.fftSize = 1024;
          ac.createMediaElementSource(a).connect(analyser).connect(ac.destination);
          stopMeter = meter(analyser);
        }
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          clearTimeout(guard);
          stopMeter();
          resolve();
        };
        // Safety net: never wait forever on a stalled clip.
        const guard = setTimeout(done, 15_000 + text.length * 120);
        a.onloadedmetadata = () => {
          clearTimeout(guard);
          setTimeout(done, (a.duration || 30) * 1000 + 2_000);
        };
        a.onended = a.onerror = a.onpause = done;
        a.play().catch(() => {
          blocked = true;
          done();
        });
      });
      URL.revokeObjectURL(url);
      if (blocked) throw new Error("autoplay blocked"); // → browser voice below
    } catch (err) {
      // With OpenAI configured, a different (browser) voice would break the illusion: stay
      // silent — the line is still on screen. Browser voice only when there is no OpenAI key.
      if (err instanceof Error && err.message === "no-openai") await speakBrowser(text);
    } finally {
      player.current = null;
      set("idle");
    }
  }

  /** Records one turn; resolves with the transcript when the user stops talking (or `stop()`). */
  async function listen(): Promise<string> {
    setInterim("");
    if (openai && typeof MediaRecorder !== "undefined") return listenOpenAi();
    return listenBrowser();
  }

  async function listenOpenAi(): Promise<string> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    const ac = audioContext();
    const analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    const source = ac.createMediaStreamSource(stream);
    source.connect(analyser);

    let spoke = false;
    let quietSince = 0;
    let discard = false;
    const stopMeter = meter(analyser, (level) => {
      if (level > SPEECH_LEVEL) {
        spoke = true;
        quietSince = 0;
      } else if (spoke && level < SILENCE_LEVEL) {
        quietSince ||= performance.now();
        if (performance.now() - quietSince > SILENCE_MS && rec.state === "recording") rec.stop();
      }
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
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    endTurn.current = abortTurn.current = null;
    if (discard || !spoke) {
      set("idle");
      return "";
    }

    set("transcribing");
    try {
      const form = new FormData();
      form.append("audio", new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
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
    if (!Rec)
      throw new Error(
        "Tu navegador no permite dictado. Usa Chrome o Edge, o escribe tu respuesta.",
      );
    return new Promise((resolve, reject) => {
      const r = new Rec();
      r.lang = locale === "es" ? "es-MX" : "en-US";
      r.continuous = false; // the browser ends the turn on silence
      r.interimResults = true;
      let heard = "";
      let discard = false;
      r.onresult = (e) => {
        heard = "";
        for (let i = 0; i < e.results.length; i++) heard += e.results[i]![0]!.transcript;
        setInterim(heard);
        publishLevel(0.5);
        setTimeout(() => publishLevel(0), 120);
      };
      r.onerror = (e) => {
        if (e.error === "not-allowed") reject(new Error("NotAllowedError"));
      };
      r.onend = () => {
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

  /** Silences Emily and drops any recording in progress. */
  const cancel = useCallback(() => {
    player.current?.pause();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    abortTurn.current?.();
    publishLevel(0);
  }, []);

  useEffect(() => cancel, [cancel]);

  return { state, interim, say, listen, stop, cancel, unlock };
}
