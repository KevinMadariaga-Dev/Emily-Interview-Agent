import { describe, expect, it } from "vitest";
import { planFromText } from "@/features/demo/plan-fallback";

describe("planFromText", () => {
  it("organizes the clothing-store request into questions + extras", () => {
    const plan = planFromText(
      "Tengo que crear una lista de preguntas para conocer el modelo del negocio de un cliente. El negocio es de ropa, necesito preguntar si tienen sitio web, sistema de inventario, si han vendido alguna vez por internet, si saben usar un sitio web, si implementaran ventas por internet.",
    );
    const texts = plan.questions.map((q) => q.text);

    expect(plan.context).toBe("ropa");
    expect(plan.name).toBe("Modelo de negocio · Ropa");
    expect(texts).toContain("¿Tienen sitio web?");
    expect(texts).toContain("¿Tienen sistema de inventario?");
    expect(texts).toContain("¿Han vendido alguna vez por internet?");
    expect(plan.questions.filter((q) => !q.suggested)).toHaveLength(5);
    expect(plan.questions.some((q) => q.suggested && /stock/.test(q.text))).toBe(true);
  });

  it("still returns a usable plan for free text", () => {
    const plan = planFromText("Quiero hablar con clientes");
    expect(plan.questions.length).toBeGreaterThan(0);
  });
});
