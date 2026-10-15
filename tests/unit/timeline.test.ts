import { describe, expect, it } from "vitest";
import { byUrgency, kindOf, normalizeDraft, summarySchema } from "@/features/landing/config";
import {
  classifyTimeline,
  normalizeQuestions,
  questionTreeSchema,
} from "@/features/landing/question-tree";
import { realtimeInstructions, turnDirective } from "@/features/landing/realtime-prompt";

describe("timeline: by when they want it", () => {
  it.each([
    ["Ya, lo antes posible", "asap"],
    ["Para este mes, es urgente", "asap"],
    ["Para ayer", "asap"],
    ["As soon as possible", "asap"],
    ["En uno o dos meses", "short"],
    ["Antes de diciembre", "short"],
    ["Pronto", "short"],
    ["In a couple of months", "short"],
    ["El otro año", "long"],
    ["En unos seis meses", "long"],
    ["Cuando tenga plata", "long"],
    ["Más adelante", "long"],
    ["Next year", "long"],
    ["Por ahora no", "not_now"],
    ["No lo necesito todavía", "not_now"],
    ["No es prioridad", "not_now"],
    ["No sé", "unknown"],
    ["Mmm, depende", "unknown"],
  ])("%s → %s", (said, expected) => {
    expect(classifyTimeline(said)).toBe(expected);
  });

  it("orders what they want by urgency (asap first)", () => {
    const items = [
      { item: "a", timeline: "unknown" as const },
      { item: "b", timeline: "long" as const },
      { item: "c", timeline: "asap" as const },
      { item: "d", timeline: "not_now" as const },
      { item: "e", timeline: "short" as const },
    ];
    expect(byUrgency(items).map((x) => x.timeline)).toEqual(["asap", "short", "long", "not_now", "unknown"]);
  });

  it("summaries saved before timelines existed are still valid", () => {
    const old = summarySchema.parse({
      summary: "x",
      insights: [],
      answers: [{ question: "q", answer: "a", status: "completa" }],
      objective: { met: true, reason: "r" },
    });
    expect(old.opportunities).toEqual([]);
  });
});

describe("purpose", () => {
  it("is validated by Zod and kept; questions without it work as before", () => {
    const ok = [{ text: "¿Tienes web?", kind: "cerrada", branches: { no: [{ text: "¿Para cuándo la quieres?", kind: "abierta", purpose: "timeline" }] } }];
    expect(questionTreeSchema.safeParse(ok).success).toBe(true);
    const bad = [{ text: "¿Tienes web?", kind: "cerrada", purpose: "sell" }];
    expect(questionTreeSchema.safeParse(bad).success).toBe(false);
    const qs = normalizeQuestions(ok, kindOf);
    expect(qs[0]!.branches!.no![0]!.purpose).toBe("timeline");
    expect(normalizeQuestions([{ text: "¿Cómo venden?", kind: "abierta", purpose: "nope" }], kindOf)[0]).toEqual({
      id: "q1",
      text: "¿Cómo venden?",
      kind: "abierta",
    });
  });
});

describe("timeline: what Emily is told", () => {
  const d = normalizeDraft({
    locale: "es",
    questions: [
      {
        text: "¿Tienes página web?",
        kind: "cerrada",
        branches: {
          no: [
            {
              text: "¿Te gustaría tener una?",
              kind: "cerrada",
              purpose: "interest",
              branches: {
                yes: [
                  { text: "¿Cómo te la imaginas?", kind: "abierta", purpose: "vision" },
                  { text: "¿Para cuándo te gustaría tenerla?", kind: "abierta", purpose: "timeline" },
                ],
                no: [{ text: "¿Por qué no?", kind: "abierta", purpose: "reason" }],
              },
            },
          ],
        },
      },
      "¿Cómo registran sus ventas?",
    ],
  });

  it("never skips the timeline, never re-asks one already given, one gentle follow-up when vague", () => {
    const s = realtimeInstructions(d);
    expect(s).toMatch(/quiere algo nuevo o una mejora, en CUALQUIER pregunta, pregunta UNA vez para cuándo/);
    expect(s).toMatch(/Si ya dijo el plazo[\s\S]*NO lo preguntes/);
    expect(turnDirective(d, "q1n1y2", 1)).toMatch(/plazo fue vago[\s\S]*UNA repregunta suave/);
    expect(turnDirective(d, "q2", 2)).toMatch(/quiere algo nuevo o una mejora y no dijo para cuándo[\s\S]*pregunta el plazo/);
  });

  it("'would you like one?': a doubt counts as interest", () => {
    const t = turnDirective(d, "q1n1", 1, false, "unclear");
    expect(t).toContain("[q1n1y1]");
    expect(t).not.toMatch(/aclaración|Por qué no/);
  });
});

describe("timeline: one clear instruction once the app read the answer", () => {
  const d = normalizeDraft({
    locale: "es",
    questions: [
      {
        text: "¿Tienes página web?",
        kind: "cerrada",
        branches: {
          yes: [
            { text: "¿Hace cuánto la tienes?", kind: "abierta", purpose: "discover" },
            { text: "¿Para cuándo quieres la mejora?", kind: "abierta", purpose: "timeline" },
          ],
        },
      },
      "¿Cuántas personas trabajan?",
    ],
  });
  it("a vague timeline gets one gentle follow-up, then moves on", () => {
    const t = turnDirective(d, "q1y2", 1, false, undefined, [], { vague: true, wants: null });
    expect(t).toMatch(/UNA repregunta suave[\s\S]*semanas o en meses/);
    expect(turnDirective(d, "q1y2", 2, false, undefined, [], { vague: true, wants: null })).toMatch(
      /EXACTAMENTE la pregunta \[q2\]/,
    );
  });
  it("something wanted without a 'by when' gets its timeline question", () => {
    const t = turnDirective(d, "q1y2", 1, false, undefined, [], { vague: false, wants: "pagos en línea" });
    expect(t).toMatch(/para cuándo le gustaría tener pagos en línea/);
    // A timeline question comes next anyway: not asked twice.
    const soon = turnDirective(d, "q1y1", 1, false, undefined, [], { vague: false, wants: "pagos en línea" });
    expect(soon).toMatch(/EXACTAMENTE la pregunta \[q1y2\]/);
  });
  it("otherwise exactly the next open question, nothing else", () => {
    const t = turnDirective(d, "q1y1", 1, false, undefined, [], { vague: false, wants: null });
    expect(t).toMatch(/EXACTAMENTE la pregunta \[q1y2\][\s\S]*No hagas ninguna otra/);
    expect(t).not.toMatch(/Si la respuesta fue|Si en su respuesta/);
  });
});

describe("timeline: in the branch's own order", () => {
  it("something wanted waits for the branch's timeline question instead of jumping ahead", () => {
    const d = normalizeDraft({
      locale: "es",
      questions: [
        {
          text: "¿Te gustaría tener una web?",
          kind: "cerrada",
          purpose: "interest",
          branches: {
            yes: [
              { text: "¿Cómo te la imaginas?", kind: "abierta", purpose: "vision" },
              { text: "¿Alguna web de referencia?", kind: "abierta", purpose: "vision" },
              { text: "¿Para cuándo la quieres?", kind: "abierta", purpose: "timeline" },
            ],
          },
        },
        "¿Cuántas personas trabajan?",
      ],
    });
    const t = turnDirective(d, "q1y1", 1, false, undefined, [], { vague: false, wants: "una web con menú" });
    expect(t).toMatch(/EXACTAMENTE la pregunta \[q1y2\]/); // the reference question, not a timeline jump
  });
});

describe("timeline: only an explicit wish gets its 'by when'", () => {
  it("tells a wish from a complaint", async () => {
    const { wishes } = await import("@/features/landing/question-tree");
    expect(wishes("Sí, me gustaría agregar pagos en línea.")).toBe(true);
    expect(wishes("I'd like faster checkout and saved favorites.")).toBe(true);
    expect(wishes("Quiero una página sencilla")).toBe(true);
    expect(wishes("Honestly, the app is slow and the delivery fee is too high.")).toBe(false);
    expect(wishes("Lower delivery fees would definitely bring me back.")).toBe(false);
    expect(wishes("La app es lenta y el envío es caro.")).toBe(false);
  });
});

describe("a summary is never rejected for its length", () => {
  it("cuts long texts and lists instead of failing (the interview is always saved)", () => {
    const s = summarySchema.parse({
      summary: "x".repeat(3000),
      insights: Array.from({ length: 20 }, (_, i) => `insight ${i}`),
      answers: [{ question: "q", answer: "a".repeat(5000), status: "completa" }],
      objective: { met: true, reason: "r".repeat(900) },
      keyFacts: Array.from({ length: 15 }, () => "k".repeat(700)), // the real failure: 15 facts, 700 chars
      quotes: ["q".repeat(900)],
    });
    expect(s.summary).toHaveLength(1500);
    expect(s.insights).toHaveLength(8);
    expect(s.keyFacts).toHaveLength(12);
    expect(s.keyFacts[0]).toHaveLength(300);
    expect(s.quotes[0]).toHaveLength(400);
    expect(s.answers[0]!.answer).toHaveLength(2000);
  });
});

describe("summary labels never sink a summary", () => {
  it("an invented or translated timeline value is dropped (or 'unknown'), the rest kept", () => {
    const s = summarySchema.parse({
      summary: "x",
      insights: [],
      answers: [{ question: "q", answer: "a", status: "completa", timeline: "lo antes posible", purpose: "vender" }],
      objective: { met: true, reason: "r" },
      opportunities: [{ item: "web", timeline: "pronto" }],
    });
    expect(s.answers[0]!.timeline).toBeUndefined();
    expect(s.answers[0]!.purpose).toBeUndefined();
    expect(s.opportunities[0]!.timeline).toBe("unknown");
  });
});
