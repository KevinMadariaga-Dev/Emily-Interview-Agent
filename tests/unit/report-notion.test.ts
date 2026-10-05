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
const summary = {
  summary: "Tienen Shopify; inventario en papel.",
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

describe("toNotionInterviewPage", () => {
  const page = toNotionInterviewPage({
    dataSourceId: "ds_123",
    draft,
    summary,
    history: Array.from({ length: 150 }, (_, i) => ({
      role: i % 2 ? ("participant" as const) : ("emily" as const),
      text: `t${i}`,
    })),
    at: new Date("2026-10-02T15:00:00Z"),
  });

  it("fills every database column with the score and verdict", () => {
    expect(Object.keys(page.properties).sort()).toEqual(Object.keys(NOTION_PROPERTIES).sort());
    expect(page.properties["Información obtenida"].number).toBe(0.75);
    expect(page.properties.Veredicto.select.name).toBe("Parcial");
    expect(page.parent).toEqual({ type: "data_source_id", data_source_id: "ds_123" });
  });

  it("keeps the email's order and Notion's 100-children limits", () => {
    const headings = page.children
      .filter((b) => b.type === "heading_2")
      .map((b) => ("heading_2" in b ? b.heading_2.rich_text[0]!.text.content : ""));
    expect(headings).toEqual([
      "Datos de la entrevista",
      "Preguntas de la entrevista",
      "Resumen",
      "Información clave",
      "Dolores y problemas",
      "Hallazgos",
      "Citas del participante",
      "Próximos pasos y oportunidades",
      "Respuestas por pregunta",
    ]);
    expect(page.children.length).toBeLessThanOrEqual(100);
    const transcript = page.children.at(-1) as { toggle: { children: unknown[] } };
    expect(transcript.toggle.children.length).toBeLessThanOrEqual(100);
  });
});
