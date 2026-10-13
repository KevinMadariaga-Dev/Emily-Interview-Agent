import { describe, expect, it } from "vitest";
import { turnDetector } from "@/features/landing/voice-level";

const FRAME = 16; // ms (≈60 fps)
/** Feeds `ms` of a constant level; returns the time (ms from start) the turn ended, or null. */
function run(segments: [level: number, ms: number][]) {
  const d = turnDetector();
  let t = 0;
  for (const [level, ms] of segments)
    for (const end = t + ms; t < end; t += FRAME) if (d.frame(level, t)) return { endedAt: t, d };
  return { endedAt: null, d };
}

describe("end of turn (3 s of silence after talking)", () => {
  it("ends ~3 s after the user stops talking", () => {
    const { endedAt } = run([
      [0.01, 400],
      [0.4, 2000],
      [0.01, 5000],
    ]);
    expect(endedAt).not.toBeNull();
    expect(endedAt! - 2400).toBeGreaterThanOrEqual(3000 - FRAME); // last voice frame is 1 frame earlier
    expect(endedAt! - 2400).toBeLessThan(3100);
  });

  it("short pauses inside the answer don't end it", () => {
    const { endedAt } = run([
      [0.01, 400],
      [0.4, 1000],
      [0.01, 2000],
      [0.4, 1000],
      [0.01, 2500],
    ]);
    expect(endedAt).toBeNull(); // 2 s pause, then talks again, then only 2.5 s of quiet so far
  });

  it("background noise below the voice level counts as quiet (noisy room still ends)", () => {
    const { endedAt } = run([
      [0.03, 400],
      [0.4, 1500],
      [0.06, 4000],
    ]); // fan/hum after speaking
    expect(endedAt).not.toBeNull();
  });

  it("never ends without real speech (silence, or a click/cough)", () => {
    expect(
      run([
        [0.01, 400],
        [0.01, 8000],
      ]).endedAt,
    ).toBeNull();
    const click = run([
      [0.01, 400],
      [0.9, 48],
      [0.01, 8000],
    ]); // 48 ms spike
    expect(click.endedAt).toBeNull();
    expect(click.d.spoke()).toBe(false);
  });

  it("adapts to a louder room: its noise isn't mistaken for voice", () => {
    // Ambient 0.06 → voice threshold 0.15: steady 0.1 noise is not speech, 0.4 voice is.
    expect(
      run([
        [0.06, 400],
        [0.1, 6000],
      ]).endedAt,
    ).toBeNull();
    expect(
      run([
        [0.06, 400],
        [0.4, 1500],
        [0.1, 4000],
      ]).endedAt,
    ).not.toBeNull();
  });
});
