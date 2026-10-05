import { describe, expect, it } from "vitest";
import { kindOf, missingFields, patchSchema, presetFallback } from "@/features/landing/config";

describe("landing config", () => {
  it("preset fallback fills project, objective, questions and areas for the context", () => {
    const p = presetFallback("digital", "ferretería");
    expect(patchSchema.parse(p)).toEqual(p);
    expect(p.objective).toContain("ferretería");
    expect(p.questions?.length).toBeGreaterThanOrEqual(5);
    expect(p.project).toBe("Madurez digital · Ferretería");
  });

  it("kindOf tells closed from open questions", () => {
    expect(kindOf("¿Tienen sitio web?")).toBe("cerrada");
    expect(kindOf("¿Cuántas personas trabajan?")).toBe("cerrada");
    expect(kindOf("¿Cómo gestionan hoy el inventario?")).toBe("abierta");
  });

  it("missingFields lists what blocks 'Crear Emily'", () => {
    const empty = {
      recipientName: "",
      company: "",
      project: "",
      objective: "",
      questions: [],
      voice: "coral" as const,
      reportEmail: "",
      areas: [],
      locale: "es" as const,
      status: "active" as const,
      expires: "",
      noExpiry: false,
    };
    expect(missingFields(empty)).toEqual(["el proyecto", "el objetivo", "las preguntas"]);
    expect(
      missingFields({
        ...empty,
        project: "X",
        objective: "Entender algo útil",
        questions: [{ text: "¿Q?", kind: "abierta" as const }],
      }),
    ).toEqual([]);
  });
});

describe("interview success", () => {
  it("scores complete as 1, partial as ½ and missing as 0", async () => {
    const { coverage, verdict } = await import("@/features/landing/config");
    expect(coverage([])).toBe(0);
    expect(
      coverage([
        { status: "completa" },
        { status: "parcial" },
        { status: "sin_respuesta" },
        { status: "completa" },
      ]),
    ).toBe(63);
    expect(verdict(100).label).toBe("Éxito");
    expect(verdict(63).label).toBe("Parcial");
    expect(verdict(20).label).toBe("Insuficiente");
  });
});

describe("normalizeDraft", () => {
  it("upgrades Emilys saved by older versions (string questions, no voice)", async () => {
    const { normalizeDraft } = await import("@/features/landing/config");
    const d = normalizeDraft({
      project: "Vieja",
      objective: "Algo",
      questions: ["¿Tienen sitio web?", "¿Cómo venden hoy?", "", null],
    });
    expect(d.questions).toEqual([
      { text: "¿Tienen sitio web?", kind: "cerrada" },
      { text: "¿Cómo venden hoy?", kind: "abierta" },
    ]);
    expect(d.voice).toBe("coral");
    expect(d.locale).toBe("es");
    expect(d.areas).toEqual([]);
  });

  it("keeps only the validated female voices; anything else falls back to Coral", async () => {
    const { normalizeDraft, voiceIds } = await import("@/features/landing/config");
    expect(voiceIds).toEqual(["coral", "nova", "shimmer", "sage"]);
    for (const retired of ["onyx", "echo", "ash", "alloy", "fable", "marin", "verse"])
      expect(normalizeDraft({ voice: retired }).voice).toBe("coral");
    expect(normalizeDraft({ voice: "sage" }).voice).toBe("sage");
  });
});
