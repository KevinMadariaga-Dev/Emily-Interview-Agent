import { describe, expect, it } from "vitest";
import { normalizeDraft } from "@/features/landing/config";
import { renderInterviewEmail } from "@/features/landing/report-email";

const draft = normalizeDraft({
  project: "Boutique Luna",
  objective: "Saber si están listos para vender online",
  recipientName: "María",
  company: "Boutique Luna",
  questions: ["¿Tienen sitio web?", "¿Cómo manejan el inventario?"],
  reportEmail: "equipo@neoera.com",
});
const summary = {
  summary: "Tienen Shopify; inventario en papel.",
  insights: ["Necesitan inventario digital"],
  answers: [
    {
      question: "¿Tienen sitio web?",
      answer: "Sí, Shopify desde 2023.",
      status: "completa" as const,
    },
    {
      question: "¿Cómo manejan el inventario?",
      answer: "<script>x</script> a mano",
      status: "parcial" as const,
    },
  ],
  objective: { met: false, reason: "Falta detalle del inventario." },
  keyFacts: ["Tienda en Shopify desde 2023", "Inventario en papel"],
  painPoints: ["No saben qué sistema de inventario usar"],
  quotes: ["Lo llevamos a mano, no sé bien"],
  nextSteps: ["Proponer un sistema de inventario simple"],
};

describe("renderInterviewEmail", () => {
  const email = renderInterviewEmail({
    draft,
    summary,
    history: [
      { role: "emily", text: "¿Tienen sitio web?" },
      { role: "participant", text: "Sí, Shopify desde 2023." },
    ],
    at: new Date("2026-10-02T15:00:00Z"),
  });

  it("puts project, score and verdict in the subject", () => {
    expect(email.subject).toBe("Entrevista completada · Boutique Luna · 75% (Parcial)");
  });

  it("orders the report and escapes participant text", () => {
    const order = [
      "Datos de la entrevista",
      "Preguntas de la entrevista",
      "Resumen",
      "Información clave",
      "Dolores y problemas",
      "Hallazgos",
      "Citas del participante",
      "Próximos pasos y oportunidades",
      "Respuestas por pregunta",
      "Conversación completa",
    ];
    const idx = order.map((h) => email.html.indexOf(h));
    expect(idx.every((i) => i > 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(email.html).not.toContain("<script>x</script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.text).toContain("1. ¿Tienen sitio web? [Completa]");
  });
});
