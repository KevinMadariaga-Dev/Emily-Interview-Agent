import { describe, expect, it } from "vitest";
import { normalizeDraft } from "@/features/landing/config";
import { renderInterviewEmail } from "@/features/landing/report-email";
import { toNotionInterviewPage } from "@/features/landing/report-notion";

// An English interview: the emailed and Notion reports must read entirely in English.
const draft = normalizeDraft({
  project: "Luna Store",
  objective: "Learn if they are ready to sell online",
  recipientName: "Mary",
  locale: "en",
  questions: ["Do you have a website?", "How do you track inventory?"],
  reportEmail: "team@neoera.com",
});
const summary = {
  summary: "They sell on Shopify.",
  insights: ["Needs digital inventory"],
  answers: [
    { question: "Do you have a website?", answer: "Yes, Shopify.", status: "completa" as const },
    { question: "How do you track inventory?", answer: "By hand.", status: "parcial" as const },
  ],
  objective: { met: false, reason: "Missing detail." },
  keyFacts: ["Shopify since 2023"],
  painPoints: ["Manual inventory"],
  quotes: ["We do it by hand"],
  nextSteps: ["Offer a simple inventory tool"],
};
const history = [
  { role: "emily" as const, text: "Hi, I'm Emily." },
  { role: "participant" as const, text: "Yes, a Shopify store.", q: 0 },
];
const at = new Date("2026-10-02T15:00:00Z");
const SPANISH =
  /[¿¡ñáéíóú]|\b(?:Objetivo|Resumen|Participante|Pregunta|Respuesta|Sin|Información|Datos)\b/;

describe("English interview reports", () => {
  it("email: subject, HTML and text are in English", () => {
    const { subject, html, text } = renderInterviewEmail({ draft, summary, history, at });
    expect(subject).toBe("Interview completed · Luna Store · 75% (Partial)");
    expect(text).toContain("Goal not met. Missing detail.");
    expect(html).toContain("Key information");
    expect(html).toContain("October");
    for (const s of [subject, html, text]) expect(s).not.toMatch(SPANISH);
  });

  it("Notion: page body in English, database columns and verdict option unchanged", () => {
    const page = toNotionInterviewPage({ dataSourceId: "ds", draft, summary, history, at });
    const body = JSON.stringify(page.children);
    expect(body).toContain("Interview details");
    expect(body).toContain("What they said:");
    expect(body).not.toMatch(SPANISH);
    // Columns/options are the database schema: they stay as created by notion-setup.
    expect(page.properties.Veredicto.select.name).toBe("Parcial");
    expect(page.properties.Idioma.select.name).toBe("English");
  });
});
