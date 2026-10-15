import { describe, expect, it, vi } from "vitest";
import { normalizeDraft } from "@/features/landing/config";
import {
  PROGRESS_TOOL,
  realtimeInstructions,
  setupDirective,
  setupInstructions,
} from "@/features/landing/realtime-prompt";

vi.mock("server-only", () => ({}));
const { realtimeVoice } = await import("@/integrations/voice/openai-realtime");

const draft = (locale: "es" | "en") =>
  normalizeDraft({
    project: "Panadería Sol",
    objective: "Saber si venden en línea",
    recipientName: "Ana",
    locale,
    questions: [
      { text: "¿Tienen página web?", kind: "cerrada" },
      { text: "¿Cómo registran sus ventas?", kind: "abierta" },
    ],
  });

describe("realtime interview script", () => {
  it("is built from the saved Emily: questions in order, one strict language", () => {
    const es = realtimeInstructions(draft("es"));
    expect(es).toContain("[q1] ¿Tienen página web?");
    expect(es).toContain("[q2] ¿Cómo registran sus ventas?");
    expect(es).toMatch(/SOLO en español/);
    expect(es).toMatch(/Nunca cambies de idioma/);
    const en = realtimeInstructions(draft("en"));
    expect(en).toMatch(/SOLO en clear, neutral American English/);
  });

  it("opens with the intro AND the first question, then reports progress", () => {
    const s = realtimeInstructions(draft("es"));
    expect(s).toMatch(/UN solo turno[\s\S]*pregunta \[q1\]/);
    expect(s).toContain('report_progress(asking="q1", done=false)');
    expect(PROGRESS_TOOL.parameters.required).toEqual(["asking", "done"]);
  });

  it("keeps Emily's female voice (nova isn't a realtime voice → marin)", () => {
    expect(realtimeVoice("coral")).toBe("coral");
    expect(realtimeVoice("shimmer")).toBe("shimmer");
    expect(realtimeVoice("nova")).toBe("marin");
  });
});

describe("turn directives (the app steers every realtime reply)", () => {
  it("opens with the intro + first question, then advances in order", async () => {
    const { turnDirective } = await import("@/features/landing/realtime-prompt");
    const d = draft("es");
    expect(turnDirective(d, null, 0)).toMatch(/preséntate[\s\S]*\[q1\] "¿Tienen página web\?"/);
    expect(turnDirective(d, "q1", 1)).toMatch(/haz la pregunta \[q2\] "¿Cómo registran sus ventas\?"/);
  });

  it("allows one follow-up per question, never two", async () => {
    const { turnDirective } = await import("@/features/landing/realtime-prompt");
    const d = draft("es");
    expect(turnDirective(d, "q1", 1)).toMatch(/UNA repregunta/);
    expect(turnDirective(d, "q1", 2)).not.toMatch(/repregunta/); // already followed up: move on
  });

  it("after the last question: one-sentence goodbye, no summary or advice, in the Emily's language", async () => {
    const { turnDirective } = await import("@/features/landing/realtime-prompt");
    const es = turnDirective(draft("es"), "q2", 2);
    expect(es).toMatch(/despídete con calidez/);
    expect(es).toMatch(/Sin resumir[\s\S]*sin consejos/);
    expect(es).toContain("done=true");
    expect(turnDirective(draft("en"), "q2", 2)).toMatch(
      /say a warm goodbye[\s\S]*No summary, no advice/,
    );
  });
});

describe("realtime voice setup", () => {
  it("asks for what's missing, in order, and never for the email", () => {
    const empty = normalizeDraft({ locale: "es" });
    const d = setupDirective(empty);
    expect(d).toContain("nada");
    expect(d).toMatch(/para quién es, el proyecto, el objetivo/);
    expect(setupInstructions("es")).toMatch(/NUNCA pidas el correo/);
  });

  it("wraps up once the essentials are in", () => {
    const d = setupDirective(draft("en"));
    expect(d).toContain("for: Ana");
    expect(d).toContain("2 questions");
    expect(d).toMatch(/anything else.*setup_done/);
    expect(setupInstructions("en")).toContain("SOLO en clear, neutral American English");
  });

  it("gives English examples in English (the model repeats quoted phrases verbatim)", () => {
    expect(setupInstructions("en")).not.toMatch(/Anotado|déjame/);
    expect(setupInstructions("en")).toContain('"Got it."');
    expect(setupInstructions("es")).toContain('"Anotado."');
    expect(realtimeInstructions(draft("en"))).not.toMatch(/"¡Qué bien!"|"Entiendo\."|déjame|genial/);
    expect(realtimeInstructions(draft("en"))).toContain('"That\'s great!"');
    expect(realtimeInstructions(draft("es"))).toContain('"¡Qué bien!", "Entiendo."');
  });
});

describe("one spoken message per turn", () => {
  it("lets the real answer follow a filler, cuts a repeat after a full reply", async () => {
    const { isFullReply } = await import("@/features/landing/realtime-client");
    expect(isFullReply("Okay, let me think about how to set this up.")).toBe(false);
    expect(isFullReply("Got it. What's the goal of the interview?")).toBe(true);
    expect(
      isFullReply("Vale, gracias por compartir eso. Déjame pensar un momento cómo encajarlo todo."),
    ).toBe(false);
    expect(isFullReply("Anotado. ¿Cuál es el proyecto?")).toBe(true);
  });
});

describe("setup: a holding line still owes the question", () => {
  it("spots fillers, not requests or questions", async () => {
    const { isFiller } = await import("@/features/landing/use-setup-realtime");
    expect(isFiller("Vale, gracias por compartir eso. Déjame pensar un momento cómo encajarlo todo.")).toBe(true);
    expect(isFiller("Perfecto, eso también se suma. Dame un segundo, y seguimos afinando el resto.")).toBe(true);
    expect(isFiller("Okay, let me think about how to set this up.")).toBe(true);
    expect(isFiller("Anotado: Carlos de Panadería Sol. Ahora dime cuál es el proyecto.")).toBe(false);
    expect(isFiller("Hola, te ayudo a configurarme. Cuéntame con quién voy a hablar.")).toBe(false);
    expect(isFiller("Got it. Let me know: what's the goal?")).toBe(false);
  });
});
