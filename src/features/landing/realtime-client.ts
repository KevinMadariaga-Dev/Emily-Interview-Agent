"use client";

import { publishLevel } from "./voice-level";

export type RealtimeEvent = { type: string } & Record<string, unknown>;

/** A live speech-to-speech call with OpenAI Realtime over WebRTC (mic in, Emily's voice out). */
export type RealtimeCall = {
  send: (event: Record<string, unknown>) => void;
  /** Emily's audio element (mute it to pause her). */
  audio: HTMLAudioElement;
  mic: MediaStream;
  close: () => void;
};

/**
 * Connects the browser to OpenAI Realtime with a short-lived client secret minted by our server
 * (/api/voice/realtime): adds the mic track, plays Emily's track, and streams JSON events over the
 * "oai-events" data channel. Resolves once the channel is open.
 */
export async function connectRealtime({
  clientSecret,
  mic,
  onEvent,
}: {
  clientSecret: string;
  mic: MediaStream;
  onEvent: (e: RealtimeEvent) => void;
}): Promise<RealtimeCall> {
  const pc = new RTCPeerConnection();
  const audio = new Audio();
  audio.autoplay = true;
  let stopMeter = () => {};

  pc.ontrack = (e) => {
    const remote = e.streams[0];
    if (!remote) return;
    audio.srcObject = remote;
    void audio.play().catch(() => {});
    stopMeter();
    stopMeter = meterStreams(remote, mic); // the orb follows whoever is talking
  };
  mic.getAudioTracks().forEach((t) => pc.addTrack(t, mic));

  const dc = pc.createDataChannel("oai-events");
  dc.onmessage = (m) => {
    try {
      onEvent(JSON.parse(String(m.data)) as RealtimeEvent);
    } catch {
      /* ignore malformed frames */
    }
  };

  const close = () => {
    stopMeter();
    try {
      dc.close();
    } catch {}
    pc.close();
    audio.srcObject = null;
    mic.getTracks().forEach((t) => t.stop());
  };

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const res = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body: offer.sdp,
      headers: { Authorization: `Bearer ${clientSecret}`, "Content-Type": "application/sdp" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`realtime-sdp ${res.status}`);
    await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
    await new Promise<void>((resolve, reject) => {
      if (dc.readyState === "open") return resolve();
      const timer = setTimeout(() => reject(new Error("realtime-timeout")), 15_000);
      dc.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  } catch (err) {
    close();
    throw err;
  }

  return {
    send: (event) => {
      if (dc.readyState === "open") dc.send(JSON.stringify(event));
    },
    audio,
    mic,
    close,
  };
}

/** One loop measuring Emily's and the user's audio; publishes the louder one for the orb. */
function meterStreams(remote: MediaStream, mic: MediaStream) {
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new AC();
  const mk = (s: MediaStream) => {
    const a = ac.createAnalyser();
    a.fftSize = 1024;
    ac.createMediaStreamSource(s).connect(a);
    return { a, data: new Uint8Array(a.fftSize) };
  };
  const nodes = [mk(remote), mk(mic)];
  let raf = 0;
  const tick = () => {
    let level = 0;
    for (const { a, data } of nodes) {
      a.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      level = Math.max(level, Math.min(1, Math.sqrt(sum / data.length) * 4));
    }
    publishLevel(level);
    raf = requestAnimationFrame(tick);
  };
  void ac.resume().catch(() => {});
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    publishLevel(0);
    void ac.close().catch(() => {});
  };
}
