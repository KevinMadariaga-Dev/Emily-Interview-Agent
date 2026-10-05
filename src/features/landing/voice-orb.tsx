"use client";

import { useEffect, useRef } from "react";
import { subscribeLevel } from "./voice-level";

// Closed wavy curve around the center: r(θ) = R + Σ amp·sin(k·θ + phase).
// Computed once (server) — the motion is pure CSS rotation, so it stays on the compositor.
function wavePath(R: number, harmonics: [amp: number, k: number, phase: number][], n = 180) {
  let d = "";
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = harmonics.reduce((acc, [a, k, p]) => acc + a * Math.sin(k * t + p), R);
    d += `${i ? "L" : "M"}${(100 + r * Math.cos(t)).toFixed(2)} ${(100 + r * Math.sin(t)).toFixed(2)}`;
  }
  return `${d}Z`;
}

const curves = [
  // [path, stroke, width, rotation animation]
  {
    d: wavePath(88, [
      [2.6, 6, 0],
      [1.4, 11, 1.2],
    ]),
    className: "stroke-white/80 animate-[spin_9s_linear_infinite]",
    width: 1.4,
  },
  {
    d: wavePath(92, [
      [3, 5, 0.6],
      [1.6, 9, 2.4],
    ]),
    className: "stroke-violet-300/70 animate-[spin_13s_linear_infinite_reverse]",
    width: 1.2,
  },
  {
    d: wavePath(96, [
      [1.8, 8, 1.8],
      [1.2, 13, 0.4],
    ]),
    className: "stroke-violet-300/35 animate-[spin_20s_linear_infinite]",
    width: 1,
  },
];

export type OrbMode = "speaking" | "listening";

/**
 * Emily as a voice agent: a fluid light core (no letter) wrapped in sound — wavy sound curves
 * counter-rotating around it and expanding ripples.
 * `mode` shifts her between speaking (full sound, core glows) and listening (sound recedes,
 * core settles). Transform/opacity only; she keeps moving under reduced motion, just calmer.
 */
export function VoiceOrb({
  compact = false,
  mode = "speaking",
}: {
  compact?: boolean;
  mode?: OrbMode;
}) {
  // Shrinks with scale (compositor), not width/height (layout). 224px target in both breakpoints.
  const scale = compact ? "scale-[0.78] lg:scale-[0.54]" : "scale-100";
  const speaking = mode === "speaking";
  const ring = useRef<HTMLDivElement>(null);
  const core = useRef<HTMLSpanElement>(null);
  const glow = useRef<HTMLSpanElement>(null);

  // Follow the live voice level (Emily's audio or the user's mic). Written straight to the
  // three elements' transforms — no React renders, no CSS-variable fan-out to 64 children.
  useEffect(() => {
    let smooth = 0;
    return subscribeLevel((level) => {
      smooth += (level - smooth) * (level > smooth ? 0.5 : 0.12); // fast attack, soft release
      if (ring.current) ring.current.style.transform = `scale(${1 + smooth * 0.12})`;
      if (core.current) core.current.style.transform = `scale(${1 + smooth * 0.1})`;
      if (glow.current) glow.current.style.transform = `scale(${1 + smooth * 0.5})`;
    });
  }, []);

  return (
    <div
      className={`relative grid h-72 w-72 shrink-0 place-items-center transition-[scale] duration-500 ease-in-out motion-reduce:transition-none lg:h-[26rem] lg:w-[26rem] ${scale}`}
      data-orb
      data-mode={mode}
      aria-hidden
    >
      <span
        ref={glow}
        className={`absolute inset-[22%] rounded-full bg-fuchsia-400/30 blur-3xl transition-opacity duration-700 ease-in-out ${
          speaking ? "opacity-100" : "opacity-40"
        }`}
      />

      {[0, 1.6].map((delay) => (
        <span
          key={delay}
          className="animate-wave absolute inset-[22%] rounded-full border border-violet-200/40 opacity-0"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}

      {/* Sound waves: wavy curves, swelling with the live voice level. */}
      <div
        ref={ring}
        className={`absolute inset-0 transition-[opacity,scale] duration-500 ease-in-out ${
          speaking ? "scale-100 opacity-100" : "scale-[0.95] opacity-60"
        }`}
      >
        {curves.map((c, i) => (
          <svg
            key={i}
            viewBox="0 0 200 200"
            className={`absolute inset-0 h-full w-full fill-none ${c.className}`}
          >
            <path d={c.d} strokeWidth={c.width} strokeLinejoin="round" />
          </svg>
        ))}
      </div>

      <span ref={core} className="relative grid h-[54%] w-[54%] place-items-center">
        <FluidCore speaking={speaking} />
      </span>
    </div>
  );
}

/**
 * The "image" at Emily's center: a sphere of moving light. Three blurred color fields orbit
 * inside a clipped circle (screen-blended), under a glass highlight and an inner rim.
 */
function FluidCore({ speaking }: { speaking: boolean }) {
  const blobs = [
    ["bg-violet-400", "animate-[spin_7s_linear_infinite]", "-left-[10%] top-[5%]"],
    ["bg-fuchsia-400", "animate-[spin_9s_linear_infinite_reverse]", "left-[35%] -top-[10%]"],
    ["bg-sky-300", "animate-[spin_11s_linear_infinite]", "left-[20%] top-[45%]"],
  ] as const;
  return (
    <span
      className={`animate-breathe relative h-full w-full overflow-hidden rounded-full bg-[#1b0b4a] shadow-[0_24px_60px_-12px_rgb(0_0_0/0.55)] transition-[scale] duration-500 ease-in-out ${
        speaking ? "scale-105" : "scale-100"
      }`}
    >
      {blobs.map(([color, spin, pos]) => (
        <span key={color} className={`absolute inset-0 ${spin}`}>
          <span
            className={`absolute h-[75%] w-[75%] rounded-full opacity-90 mix-blend-screen blur-2xl ${color} ${pos}`}
          />
        </span>
      ))}
      {/* glass: top-left highlight + inner rim */}
      <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgb(255_255_255/0.55),transparent_35%)]" />
      <span className="absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_rgb(255_255_255/0.25),inset_0_-12px_30px_rgb(20_5_60/0.5)]" />
    </span>
  );
}
