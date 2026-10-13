// Live audio level (0..1) of whoever is talking, shared between the voice hook (producer)
// and Emily's orb (consumer). A plain pub/sub keeps it out of React state: it changes 60×/s.

type Listener = (level: number) => void;
const listeners = new Set<Listener>();

export function publishLevel(level: number) {
  for (const l of listeners) l(level);
}

export function subscribeLevel(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/**
 * Samples an AnalyserNode each frame and calls `onFrame` with the RMS level. `publish` also feeds
 * the orb (off for background listeners, e.g. barge-in detection while Emily talks).
 */
export function meter(analyser: AnalyserNode, onFrame?: (level: number) => void, publish = true) {
  const data = new Uint8Array(analyser.fftSize);
  let raf = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
    if (publish) publishLevel(level);
    onFrame?.(level);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    if (publish) publishLevel(0);
  };
}

/**
 * End-of-turn detector. Feed it the mic level each frame: it learns the room's ambient level for
 * `calibrateMs`, then counts as voice anything above max(minSpeech, ambient × speechX). Once the
 * user has talked for at least `minSpeechMs`, `silenceMs` without voice ends the turn — background
 * noise below the voice level counts as quiet, so a noisy room still ends the turn.
 */
export function turnDetector({
  calibrateMs = 350,
  minSpeech = 0.08,
  speechX = 2.5,
  silenceMs = 3_000,
  minSpeechMs = 250,
} = {}) {
  let t0 = -1;
  let prev = 0;
  let lastVoice = 0;
  let spokeMs = 0;
  let speech = minSpeech;
  const ambient: number[] = [];
  return {
    /** true when the turn is over (the user talked, then stayed quiet for silenceMs). */
    frame(level: number, now: number) {
      if (t0 < 0) t0 = prev = now;
      const dt = now - prev;
      prev = now;
      if (now - t0 < calibrateMs) {
        ambient.push(level);
        // Someone already talking while we calibrate shouldn't raise the bar: cap the floor.
        const floor = Math.min(ambient.reduce((a, b) => a + b, 0) / ambient.length, 0.08);
        speech = Math.max(minSpeech, floor * speechX);
      }
      if (level > speech) {
        spokeMs += dt;
        lastVoice = now;
      }
      return spokeMs >= minSpeechMs && now - lastVoice > silenceMs;
    },
    /** Whether enough voice was heard to count as an answer. */
    spoke: () => spokeMs >= minSpeechMs,
  };
}
