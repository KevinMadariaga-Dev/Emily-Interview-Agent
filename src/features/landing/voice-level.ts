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

/** Samples an AnalyserNode each frame, publishes RMS level, and calls `onFrame` with it. */
export function meter(analyser: AnalyserNode, onFrame?: (level: number) => void) {
  const data = new Uint8Array(analyser.fftSize);
  let raf = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
    publishLevel(level);
    onFrame?.(level);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    publishLevel(0);
  };
}
