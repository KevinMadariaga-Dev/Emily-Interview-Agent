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
  /** The user takes the turn (typed answer): Emily stops and her reply in progress is dropped. */
  interrupt: () => void;
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
  bargeIn = true,
}: {
  clientSecret: string;
  mic: MediaStream;
  /** false: talking over Emily doesn't cut her off (it only cancels a reply not yet voiced). */
  bargeIn?: boolean;
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
  const send = (event: Record<string, unknown>) => {
    if (dc.readyState === "open") dc.send(JSON.stringify(event));
  };
  const guard = turnGuard(send, onEvent, { bargeIn });
  dc.onmessage = (m) => {
    try {
      guard.handle(JSON.parse(String(m.data)) as RealtimeEvent);
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
    send,
    interrupt: guard.interrupt,
    audio,
    mic,
    close,
  };
}

/**
 * One spoken reply per user turn. Sits between the data channel and the hooks, and adds two events:
 * - `emily.said` {text}: a reply Emily finished saying. Only these reach the screen and the saved
 *   transcript (never `response.output_audio_transcript.done`).
 * - `emily.interrupted`: the user talked over her (or typed). That reply is cancelled, its audio
 *   cleared and its message deleted from the model's memory, so she answers once, at the end of
 *   the user's turn, taking in everything they said.
 * Also, a second message in the same reply is cut after a full one (see isFullReply).
 */
export function turnGuard(
  send: (e: Record<string, unknown>) => void,
  emit: (e: RealtimeEvent) => void,
  { bargeIn = true }: { bargeIn?: boolean } = {},
) {
  type Reply = {
    draft: string;
    texts: string[];
    items: string[];
    cut: Set<string>;
    done: boolean;
    heard: boolean;
  };
  const replies = new Map<string, Reply>();
  let generating: string | null = null;
  let playing: string | null = null;
  const get = (id: string) => {
    let r = replies.get(id);
    if (!r)
      replies.set(
        id,
        (r = { draft: "", texts: [], items: [], cut: new Set(), done: false, heard: false }),
      );
    return r;
  };
  // Generated and fully heard: it's said.
  const settle = (id: string) => {
    const r = replies.get(id);
    if (!r?.done || !r.heard) return;
    replies.delete(id);
    const text = r.texts.join(" ").trim();
    if (text) emit({ type: "emily.said", text, response_id: id });
  };
  const dropped = new Set<string>(); // their response.done (tool calls included) is swallowed
  const drop = (id: string, forget: boolean) => {
    const r = replies.get(id);
    if (!r) return;
    replies.delete(id);
    dropped.add(id);
    if (forget)
      for (const item of r.items) send({ type: "conversation.item.delete", item_id: item });
  };

  // Every reply not yet heard in full (generating, playing or queued behind the one playing).
  function interrupt() {
    const victims = [...replies.keys()];
    if (generating) send({ type: "response.cancel" });
    if (playing) send({ type: "output_audio_buffer.clear" });
    generating = playing = null;
    if (!victims.length) return;
    victims.forEach((id) => drop(id, true));
    emit({ type: "emily.interrupted" });
  }

  function handle(e: RealtimeEvent) {
    const id = e.response_id ? String(e.response_id) : "";
    switch (e.type) {
      case "response.created":
        generating = String((e.response as { id?: string })?.id ?? "");
        get(generating);
        break;
      case "response.output_item.added": {
        const item = e.item as { type?: string; id?: string };
        if (item?.type !== "message" || !item.id) break;
        const r = get(id);
        if (isFullReply(r.draft)) {
          send({ type: "response.cancel" });
          send({ type: "conversation.item.delete", item_id: item.id });
          r.cut.add(item.id);
        } else r.items.push(item.id);
        break;
      }
      case "response.output_audio_transcript.delta":
        if (replies.has(id)) get(id).draft += String(e.delta ?? "");
        break;
      case "response.output_audio_transcript.done":
        if (replies.has(id) && !get(id).cut.has(String(e.item_id)))
          get(id).texts.push(String(e.transcript ?? ""));
        break;
      case "response.done": {
        const rid = String((e.response as { id?: string })?.id ?? "");
        if (generating === rid) generating = null;
        if (dropped.delete(rid)) return; // interrupted: nothing of it happened
        if (!replies.has(rid)) break;
        get(rid).done = true;
        if (!get(rid).texts.length) get(rid).heard = true; // only a tool call: nothing to hear
        settle(rid);
        break;
      }
      case "output_audio_buffer.started":
        playing = id || generating;
        break;
      case "output_audio_buffer.stopped": {
        // Back-to-back replies (a lead-in and its question) share one audio run that reports
        // only the last one stopping: everything generated before it was heard too, in order.
        const rid = id || playing;
        playing = null;
        for (const [k, r] of [...replies]) {
          if (!r.done && k !== rid) continue;
          r.heard = true;
          settle(k);
        }
        break;
      }
      case "output_audio_buffer.cleared": // cut by the app (pause, wrap-up): none of it was said
        [...replies.keys()].forEach((k) => k !== generating && drop(k, false));
        playing = null;
        break;
      case "input_audio_buffer.speech_started":
        // The user talks: Emily only listens. Without barge-in what she's already saying goes
        // on; only a reply not voiced yet is dropped (they hadn't finished: one answer, later).
        if (bargeIn) interrupt();
        else if (generating && replies.has(generating) && generating !== playing) {
          send({ type: "response.cancel" });
          drop(generating, true);
          generating = null;
          emit({ type: "emily.interrupted" });
        }
        break;
      case "error":
        // Expected around interruptions: nothing left to cancel or delete.
        if (
          /cancel_not_active|item_not_found|not.found/i.test(
            String((e.error as { code?: string })?.code),
          )
        )
          return;
        break;
    }
    emit(e);
  }

  return { handle, interrupt };
}

/** She already asked something: a second message in the same reply would only repeat it. (A
 * statement isn't enough — "let me think how to fit it all together" is a filler, however long.) */
export const isFullReply = (text = "") => /[?？]/.test(text);

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
