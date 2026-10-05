import { describe, expect, it } from "vitest";
import { normalizeDraft } from "@/features/landing/config";
import { NOTION_PROPERTIES, toNotionInterviewPage } from "@/features/landing/report-notion";

const draft = normalizeDraft({
  project: "Boutique Luna",
  objective: "Saber si están listos para vender online",
  recipientName: "María",
  company: "Boutique Luna",
  questions: ["¿Tienen sitio web?", "¿Cómo manejan el inventario?"],
});
const longSummary = "Resumen largo. ".repeat(400); // ~6000 chars: must not be cut
const summary = {
  summary: longSummary,
  insights: ["Necesitan inventario digital"],
  answers: [
    { question: "¿Tienen sitio web?", answer: "Sí, Shopify.", status: "completa" as const },
    { question: "¿Cómo manejan el inventario?", answer: "A mano.", status: "parcial" as const },
  ],
  objective: { met: false, reason: "Falta detalle." },
  keyFacts: ["Tienda en Shopify desde 2023", "Inventario en papel"],
  painPoints: ["No saben qué sistema de inventario usar"],
  quotes: ["Lo llevamos a mano, no sé bien"],
  nextSteps: ["Proponer un sistema de inventario simple"],
};
const history = [
  { role: "emily" as const, text: "Hola, soy Emily." },
  { role: "emily" as const, text: "¿Tienen sitio web?" },
  { role: "participant" as const, text: "Sí, una tienda en Shopify desde 2023.", q: 0 },
  { role: "emily" as const, text: "¿Cómo manejan el inventario?" },
  { role: "participant" as const, text: "En un cuaderno.", q: 1 },
  ...Array.from({ length: 150 }, (_, i) => ({ role: "emily" as const, text: `extra ${i}` })),
];

type Block = { type: string } & Record<string, { rich_text?: { text: { content: string } }[] }>;
const text = (b: Block) => (b[b.type]?.rich_text ?? []).map((r) => r.text.content).join("");

describe("toNotionInterviewPage", () => {
  const page = toNotionInterviewPage({
    dataSourceId: "ds_123",
    draft,
    summary,
    history,
    at: new Date("2026-10-02T15:00:00Z"),
  });
  const blocks = page.children as Block[];

  it("fills every database column with the score and verdict", () => {
    expect(Object.keys(page.properties).sort()).toEqual(Object.keys(NOTION_PROPERTIES).sort());
    expect(page.properties["Información obtenida"].number).toBe(0.75);
    expect(page.properties.Veredicto.select.name).toBe("Parcial");
    expect(page.parent).toEqual({ type: "data_source_id", data_source_id: "ds_123" });
  });

  it("shows everything: no collapsed toggles, ordered sections", () => {
    expect(blocks.some((b) => b.type === "toggle")).toBe(false);
    const headings = blocks.filter((b) => b.type === "heading_2").map(text);
    expect(headings).toEqual([
      "Datos de la entrevista",
      "Resumen",
      "Información clave",
      "Dolores y problemas",
      "Hallazgos",
      "Citas del participante",
      "Próximos pasos y oportunidades",
      "Preguntas y respuestas",
      "Conversación completa",
    ]);
  });

  it("keeps long text whole (split into 2000-char pieces, not cut)", () => {
    const resumen = blocks[blocks.findIndex((b) => text(b) === "Resumen") + 1]!;
    expect(text(resumen)).toBe(longSummary);
    expect(resumen.paragraph!.rich_text!.every((r) => r.text.content.length <= 2000)).toBe(true);
  });

  it("puts each question with its summary and the participant's own words", () => {
    const all = blocks.map(text);
    const q1 = all.indexOf("1. ¿Tienen sitio web?");
    const q2 = all.indexOf("2. ¿Cómo manejan el inventario?");
    expect(q1).toBeGreaterThan(0);
    expect(all.slice(q1, q2)).toContain("Resumen de la respuesta: Sí, Shopify.");
    expect(all.slice(q1, q2)).toContain("“Sí, una tienda en Shopify desde 2023.”");
    expect(all.slice(q2)).toContain("“En un cuaderno.”");
  });

  it("includes the full conversation visibly, even past Notion's 100-block request limit", () => {
    const convo = blocks.slice(blocks.findIndex((b) => text(b) === "Conversación completa") + 1);
    expect(convo).toHaveLength(history.length);
    expect(blocks.length).toBeGreaterThan(100); // saveInterviewToNotion appends in batches
  });
});
