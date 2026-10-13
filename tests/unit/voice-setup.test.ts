import { describe, expect, it, vi } from "vitest";

// The voice setup without an LLM key (local fallback), auth mocked.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/admin", () => ({ requireAdmin: async () => {} }));
vi.mock("@/server/repositories/emily.repository", () => ({ emilyRepository: {} }));

const { fillFromSpeech } = await import("@/features/landing/ai");
const { normalizeDraft } = await import("@/features/landing/config");

const ready = (locale: "es" | "en") =>
  normalizeDraft({
    project: "Luna",
    objective: "Saber cómo venden",
    questions: ["¿Tienen web?"],
    locale,
  });

describe("voice setup closing", () => {
  it("asks whether there's anything else once the questions exist", async () => {
    const r = await fillFromSpeech("Quiero saber cómo manejan el inventario", normalizeDraft({}));
    expect(r.done).toBe(false);
    const r2 = await fillFromSpeech("También cómo venden en línea", ready("es"));
    expect(r2.done).toBe(false);
    expect(r2.reply).toContain("¿Quieres que Emily pregunte algo más o eso es todo?");
  });

  it("closes only when the whole answer is 'that's all'", async () => {
    for (const said of ["Es todo", "eso es todo, gracias", "No.", "ya está"])
      expect((await fillFromSpeech(said, ready("es"))).done, said).toBe(true);
    expect((await fillFromSpeech("That's all, thanks!", ready("en"))).reply).toBe("Great!");
    for (const said of ["No, también pregunta por los precios", "Agrega una sobre envíos"])
      expect((await fillFromSpeech(said, ready("es"))).done, said).toBe(false);
  });

  it("doesn't close before the essentials exist", async () => {
    expect((await fillFromSpeech("es todo", normalizeDraft({}))).done).toBe(false);
  });
});

describe("spoken confirmation", () => {
  it("tells yes, no and corrections apart", async () => {
    const { answerKind } = await import("@/features/landing/config");
    for (const s of ["Sí", "si, correcto", "Claro que sí", "Está bien", "Yes", "yeah that's right"])
      expect(answerKind(s), s).toBe("yes");
    for (const s of ["No", "no, el proyecto es otro", "Incorrecto", "Nope"])
      expect(answerKind(s), s).toBe("no");
    for (const s of ["El proyecto se llama Luna", "Cambia la segunda pregunta"])
      expect(answerKind(s), s).toBeNull();
  });
});

describe("sentence splitting for Emily's voice", () => {
  it("splits on sentence ends, keeps short pieces together, never loses text", async () => {
    const { splitSentences } = await import("@/features/landing/config");
    const line =
      "Perfecto. Para enviarte los resultados, puedes continuar agregando el correo en la configuración. ¡Gracias por configurar Emily! La configuración de Emily es la siguiente.";
    const parts = splitSentences(line);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts).toHaveLength(2); // long line → few long chunks (few joins, no choppy pauses)
    expect(parts[0]).toMatch(/^Perfecto\. Para enviarte/); // "Perfecto." alone is too short
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(line);
    expect(splitSentences("¿Quieres algo más?")).toEqual(["¿Quieres algo más?"]);
    const short = "Anoté el proyecto. ¿Quieres que Emily pregunte algo más o eso es todo?";
    expect(splitSentences(short)).toEqual([short]); // short lines stay whole
    expect(splitSentences("Sin punto final")).toEqual(["Sin punto final"]);
  });
});
