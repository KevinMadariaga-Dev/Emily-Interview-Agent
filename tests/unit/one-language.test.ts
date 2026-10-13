import { describe, expect, it } from "vitest";
import { detectLang, mixesLanguages, normalizeDraft } from "@/features/landing/config";

describe("one language per Emily", () => {
  it("tells Spanish from English questions", () => {
    expect(detectLang("¿Cómo gestionan hoy el inventario de la cafetería?")).toBe("es");
    expect(detectLang("¿Tienen página web?")).toBe("es");
    expect(detectLang("How do you currently manage your inventory?")).toBe("en");
    expect(detectLang("Do you have a website?")).toBe("en");
    expect(detectLang("Shopify")).toBeNull(); // too little to tell (names, brands)
  });

  it("flags an English Emily with Spanish content (and vice versa), not consistent ones", () => {
    const en = normalizeDraft({
      locale: "en",
      objective: "Learn how they sell online",
      questions: ["Do you have a website?", "How do you track your sales?"],
    });
    expect(mixesLanguages(en)).toBe(false);
    expect(
      mixesLanguages({
        ...en,
        questions: [...en.questions, { text: "¿Cómo registran sus ventas?", kind: "abierta" }],
      }),
    ).toBe(true);
    const es = normalizeDraft({
      locale: "es",
      objective: "Saber cómo venden en línea",
      questions: ["¿Tienen página web?"],
      areas: ["pagos", "Shopify"],
    });
    expect(mixesLanguages(es)).toBe(false);
    expect(mixesLanguages({ ...es, objective: "Learn how they sell online" })).toBe(true);
  });
});
