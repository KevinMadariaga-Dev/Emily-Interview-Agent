import { describe, expect, it } from "vitest";
import { turnGuard, type RealtimeEvent } from "@/features/landing/realtime-client";

/** Feeds raw realtime events through the guard; records what reaches the hooks and the server. */
function setup() {
  const sent: Record<string, unknown>[] = [];
  const out: RealtimeEvent[] = [];
  const g = turnGuard((e) => sent.push(e), (e) => out.push(e));
  const ev = (type: string, extra: Record<string, unknown> = {}) => g.handle({ type, ...extra });
  /** Emily generates a reply (fully, as she does well before it's heard) and starts playing it. */
  const reply = (id: string, text: string) => {
    ev("response.created", { response: { id } });
    ev("response.output_item.added", { response_id: id, item: { type: "message", id: `item-${id}` } });
    ev("response.output_audio_transcript.delta", { response_id: id, delta: text });
    ev("response.output_audio_transcript.done", { response_id: id, item_id: `item-${id}`, transcript: text });
    ev("response.done", { response: { id, status: "completed" } });
    ev("output_audio_buffer.started", { response_id: id });
  };
  const said = () => out.filter((e) => e.type === "emily.said").map((e) => e.text);
  return { g, ev, reply, said, sent, out };
}

describe("one spoken reply per user turn (turnGuard)", () => {
  it("a reply heard in full is said once", () => {
    const t = setup();
    t.reply("r1", "Thanks. How often do you order?");
    expect(t.said()).toEqual([]); // not before she finished saying it
    t.ev("output_audio_buffer.stopped", { response_id: "r1" });
    expect(t.said()).toEqual(["Thanks. How often do you order?"]);
  });

  it("agent talks → user interrupts → user finishes → a single reply", () => {
    const t = setup();
    t.reply("r1", "Thanks, I hear that. Next, do you use an inventory system?");
    t.ev("input_audio_buffer.speech_started"); // barge-in
    expect(t.sent).toContainEqual({ type: "output_audio_buffer.clear" });
    expect(t.sent).toContainEqual({ type: "conversation.item.delete", item_id: "item-r1" });
    expect(t.out.filter((e) => e.type === "emily.interrupted")).toHaveLength(1);
    t.ev("output_audio_buffer.cleared", { response_id: "r1" });
    t.ev("output_audio_buffer.stopped", { response_id: "r1" }); // late event: still not said
    t.ev("input_audio_buffer.speech_stopped");
    t.reply("r2", "Thanks, got it. Next, do you use an inventory system?");
    t.ev("output_audio_buffer.stopped", { response_id: "r2" });
    expect(t.said()).toEqual(["Thanks, got it. Next, do you use an inventory system?"]);
  });

  it("interrupting 1, 2 and 3 times in a row still ends in one reply", () => {
    for (const times of [1, 2, 3]) {
      const t = setup();
      for (let k = 0; k < times; k++) {
        t.reply(`r${k}`, `Validation ${k}.`);
        t.ev("input_audio_buffer.speech_started");
      }
      t.reply("final", "One answer for everything.");
      t.ev("output_audio_buffer.stopped", { response_id: "final" });
      expect(t.said()).toEqual(["One answer for everything."]);
    }
  });

  it("talking while she's still thinking cancels the reply before it's voiced", () => {
    const t = setup();
    t.ev("response.created", { response: { id: "r1" } });
    t.ev("input_audio_buffer.speech_started");
    expect(t.sent).toContainEqual({ type: "response.cancel" });
    t.ev("response.output_audio_transcript.done", { response_id: "r1", item_id: "x", transcript: "Late text." });
    t.ev("response.done", { response: { id: "r1", status: "cancelled" } });
    expect(t.said()).toEqual([]);
  });

  it("speech after she finished is a new turn, not an interruption", () => {
    const t = setup();
    t.reply("r1", "What's the goal?");
    t.ev("output_audio_buffer.stopped", { response_id: "r1" });
    t.ev("input_audio_buffer.speech_started");
    expect(t.out.some((e) => e.type === "emily.interrupted")).toBe(false);
    expect(t.said()).toEqual(["What's the goal?"]);
  });

  it("cuts a second message after a full reply, keeps the answer after a filler", () => {
    const t = setup();
    t.reply("r1", "Got it. What's the goal of the interview?");
    t.ev("response.output_item.added", { response_id: "r1", item: { type: "message", id: "dup" } });
    expect(t.sent).toContainEqual({ type: "conversation.item.delete", item_id: "dup" });
    t.ev("response.output_audio_transcript.done", { response_id: "r1", item_id: "dup", transcript: "Perfect. I've" });
    t.ev("output_audio_buffer.stopped", { response_id: "r1" });
    expect(t.said()).toEqual(["Got it. What's the goal of the interview?"]);

    const f = setup();
    f.ev("response.created", { response: { id: "r2" } });
    f.ev("response.output_item.added", { response_id: "r2", item: { type: "message", id: "a" } });
    f.ev("response.output_audio_transcript.delta", { response_id: "r2", delta: "Okay, let me think." });
    f.ev("response.output_item.added", { response_id: "r2", item: { type: "message", id: "b" } });
    expect(f.sent).toEqual([]);
  });
});

describe("an interrupted reply leaves no trace", () => {
  it("its progress call isn't passed on (no tool output, no continuation)", () => {
    const t = setup();
    t.ev("response.created", { response: { id: "r1" } });
    t.ev("input_audio_buffer.speech_started");
    t.ev("response.done", { response: { id: "r1", status: "cancelled", output: [{ type: "function_call" }] } });
    expect(t.out.some((e) => e.type === "response.done")).toBe(false);
  });
});

describe("back-to-back replies", () => {
  it("a lead-in and its question, heard as one audio run, are both said in order", () => {
    const t = setup();
    t.reply("r1", "Thanks, got it.");
    t.reply("r2", "What usually makes you stop ordering?");
    t.ev("output_audio_buffer.stopped", { response_id: "r2" });
    expect(t.said()).toEqual(["Thanks, got it.", "What usually makes you stop ordering?"]);
  });

  it("an interruption drops the queued one too", () => {
    const t = setup();
    t.reply("r1", "Thanks, got it.");
    t.reply("r2", "What usually makes you stop ordering?");
    t.ev("input_audio_buffer.speech_started");
    t.ev("output_audio_buffer.stopped", { response_id: "r2" });
    expect(t.said()).toEqual([]);
    expect(t.sent).toContainEqual({ type: "conversation.item.delete", item_id: "item-r1" });
    expect(t.sent).toContainEqual({ type: "conversation.item.delete", item_id: "item-r2" });
  });
});
