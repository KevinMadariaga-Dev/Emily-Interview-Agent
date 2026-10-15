import { describe, expect, it } from "vitest";
import { coverage, kindOf, normalizeDraft, settleBranches } from "@/features/landing/config";
import {
  matchAsked,
  nextAfter,
  normalizeQuestions,
  questionTreeSchema,
  skipped,
  type Question,
} from "@/features/landing/question-tree";
import {
  describeQuestions,
  realtimeInstructions,
  turnDirective,
} from "@/features/landing/realtime-prompt";

/** The spec's example: "¿Tienes página web?" with a yes branch and a nested no branch. */
const web = (): Question[] =>
  normalizeQuestions(
    [
      {
        text: "¿Tienes página web?",
        kind: "cerrada",
        branches: {
          yes: [
            { text: "¿Qué funciones tiene hoy tu web?", kind: "abierta" },
            { text: "¿Qué es lo que menos te gusta de tu web?", kind: "abierta" },
          ],
          no: [
            {
              text: "¿Te gustaría tener una?",
              kind: "cerrada",
              branches: {
                yes: [{ text: "¿Qué te gustaría que hiciera?", kind: "abierta" }],
                no: [{ text: "¿Cómo consiguen clientes hoy?", kind: "abierta" }],
              },
            },
            { text: "¿Qué te ha impedido tenerla hasta ahora?", kind: "abierta" },
          ],
        },
      },
      { text: "¿Cómo registran sus ventas?", kind: "abierta" },
    ],
    kindOf,
  );

const deep = (levels: number): unknown =>
  levels === 1
    ? { text: "¿Pregunta final?", kind: "cerrada" }
    : {
        text: `¿Nivel ${levels}?`,
        kind: "cerrada",
        branches: { yes: [deep(levels - 1)] },
      };

describe("question tree: Zod validation", () => {
  it("accepts a branched yes/no question up to 3 levels", () => {
    expect(questionTreeSchema.safeParse(web()).success).toBe(true);
    expect(questionTreeSchema.safeParse([deep(3)]).success).toBe(true);
  });

  it("rejects a 4th level, branches on an open question and oversized trees", () => {
    expect(questionTreeSchema.safeParse([deep(4)]).success).toBe(false);
    const open = { text: "¿Cómo venden?", kind: "abierta", branches: { yes: [{ text: "¿Y?", kind: "abierta" }] } };
    expect(questionTreeSchema.safeParse([open]).success).toBe(false);
    const many = Array.from({ length: 10 }, (_, i) => ({
      text: `¿Pregunta ${i}?`,
      kind: "cerrada",
      branches: {
        yes: Array.from({ length: 3 }, (_, j) => ({ text: `¿Sí ${j}?`, kind: "abierta" })),
        no: Array.from({ length: 2 }, (_, j) => ({ text: `¿No ${j}?`, kind: "abierta" })),
      },
    }));
    expect(questionTreeSchema.safeParse(many).success).toBe(false); // 60 > 40 questions
  });
});

describe("question tree: older Emilys and ids", () => {
  it("plain lists become open/closed questions with stable ids and no branches", () => {
    const d = normalizeDraft({ questions: ["¿Tienen web?", { text: "¿Cómo venden?", kind: "abierta" }] });
    expect(d.questions).toEqual([
      { id: "q1", text: "¿Tienen web?", kind: "cerrada" },
      { id: "q2", text: "¿Cómo venden?", kind: "abierta" },
    ]);
    expect(normalizeDraft({ questions: d.questions }).questions).toEqual(d.questions); // same ids
  });

  it("branch ids follow the position, saved ids are kept, a 4th level is cut", () => {
    const qs = web();
    expect(qs[0]!.branches!.yes!.map((q) => q.id)).toEqual(["q1y1", "q1y2"]);
    expect(qs[0]!.branches!.no![0]!.branches!.no![0]!.id).toBe("q1n1n1");
    expect(normalizeQuestions([{ id: "web", text: "¿Tienes web?", kind: "cerrada" }], kindOf)[0]!.id).toBe("web");
    const cut = normalizeQuestions([deep(4)], kindOf);
    expect(cut[0]!.branches!.yes![0]!.branches!.yes![0]!.branches).toBeUndefined();
  });
});

describe("question tree: where the interview goes", () => {
  it("follows only the branch the answer leads to, then the next main question", () => {
    const qs = web();
    expect(nextAfter(qs, "q1", "yes")!.id).toBe("q1y1");
    expect(nextAfter(qs, "q1", "no")!.id).toBe("q1n1");
    expect(nextAfter(qs, "q1y2")!.id).toBe("q2"); // end of the yes branch → next main question
    expect(nextAfter(qs, "q1n1", "no")!.id).toBe("q1n1n1");
    expect(nextAfter(qs, "q1n1n1")!.id).toBe("q1n2"); // back up one level
    expect(nextAfter(qs, "q2")).toBeUndefined();
  });

  it("the branch not taken doesn't apply", () => {
    expect([...skipped(web(), { q1: "yes" })]).toEqual(["q1n1", "q1n1y1", "q1n1n1", "q1n2"]);
  });
});

describe("question tree: what Emily is told", () => {
  it("the script shows each branch under its yes/no question, and the branch rules", () => {
    const text = describeQuestions(web(), true);
    expect(text).toContain("[q1] ¿Tienes página web? (sí/no, con ramas)");
    expect(text).toMatch(/Si AFIRMATIVA:\n\s+\[q1y1\]/);
    expect(text).toMatch(/Si NEGATIVA:\n\s+\[q1n1\] ¿Te gustaría tener una\? \(sí\/no, con ramas\)/);
    const s = realtimeInstructions(normalizeDraft({ locale: "es", questions: web() }));
    expect(s).toMatch(/INTENCIÓN de la respuesta por su sentido/);
    expect(s).toContain('"tenemos una en Wix"');
    expect(s).toContain('"No, sí tengo, pero está vieja" = AFIRMATIVA');
    // An Emily without branches doesn't get the rules (same prompt as before).
    expect(realtimeInstructions(normalizeDraft({ questions: ["¿Cómo venden?"] }))).not.toMatch(/RAMAS/);
  });

  it("after a yes/no with branches: each intent gets only its own branch", () => {
    const d = normalizeDraft({ locale: "es", questions: web() });
    const t = turnDirective(d, "q1", 1);
    const yes = t.split("\n").find((l) => l.includes("AFIRMATIVA:"))!;
    const no = t.split("\n").find((l) => l.includes("NEGATIVA:"))!;
    expect(yes).toContain("[q1y1]");
    expect(yes).not.toContain("¿Te gustaría tener una?"); // never on the yes branch
    expect(yes).toContain('intent="yes"');
    expect(no).toContain("[q1n1] \"¿Te gustaría tener una?\"");
    expect(no).not.toContain("funciones"); // never asks about a website they don't have
    expect(t).toMatch(/AMBIGUA: haz UNA sola pregunta corta de aclaración[\s\S]*intent="unclear"/);
    expect(turnDirective(d, "q1", 2, true)).toMatch(/Ya pediste una aclaración[\s\S]*NEGATIVA/);
  });

  it("inside a branch: the first question not answered yet, then back to the main questions", () => {
    const d = normalizeDraft({ locale: "es", questions: web() });
    const t = turnDirective(d, "q1y1", 1);
    expect(t).toMatch(/SALTA cada pregunta que ya respondió[\s\S]*primera de estas que siga sin respuesta: \[q1y2\]/);
    expect(t).toContain('si ya las respondió todas, haz [q2] "¿Cómo registran sus ventas?"');
    expect(turnDirective(d, "q1y2", 1)).toMatch(/haz la pregunta \[q2\]/);
  });
});

describe("question tree: the summary", () => {
  const a = (questionId: string, status = "completa" as const, extra = {}) => ({
    questionId,
    question: questionId,
    answer: `respuesta ${questionId}`,
    status,
    ...extra,
  });

  it("records the branch taken; the other branch is 'no_aplica', never 'sin respuesta'", () => {
    const out = settleBranches(
      web(),
      [
        { ...a("q1", "completa", { branchTaken: "yes", route: "Tiene web → funciones" }), followUps: [a("q1y1")] },
        a("q2"),
      ],
      "es",
    );
    expect(out[0]!.branchTaken).toBe("yes");
    expect(out[0]!.route).toBe("Tiene web → funciones");
    const f = Object.fromEntries(out[0]!.followUps!.map((x) => [x.questionId, x.status]));
    expect(f).toEqual({
      q1y1: "completa",
      q1y2: "sin_respuesta", // on the path but not answered
      q1n1: "no_aplica",
      q1n1y1: "no_aplica",
      q1n1n1: "no_aplica",
      q1n2: "no_aplica",
    });
    expect(out[1]!.followUps).toBeUndefined();
    // Coverage ignores what doesn't apply: q1, q1y1, q2 complete + q1y2 missing = 75%.
    expect(coverage(out)).toBe(75);
  });

  it("a nested decision and an ambiguity note are kept", () => {
    const out = settleBranches(
      web(),
      [
        {
          ...a("q1", "completa", { branchTaken: "no", ambiguityNote: "Dijo «solo Instagram»." }),
          followUps: [a("q1n1", "completa", { branchTaken: "yes" }), a("q1n1y1")],
        },
      ],
      "es",
    );
    expect(out[0]!.ambiguityNote).toBe("Dijo «solo Instagram».");
    const f = Object.fromEntries(out[0]!.followUps!.map((x) => [x.questionId, x.status]));
    expect(f).toMatchObject({ q1y1: "no_aplica", q1n1: "completa", q1n1y1: "completa", q1n1n1: "no_aplica" });
    expect(out[1]!.status).toBe("sin_respuesta"); // q2 missing from the model's answers
  });
});

describe("question tree: adding to existing questions", () => {
  it("a generated question never reuses an id already taken", () => {
    const existing = normalizeQuestions(["¿Cómo venden?", "¿Tienen web?"], kindOf); // q1, q2
    const added = { text: "¿Tienes página web?", kind: "cerrada" as const, branches: { yes: [{ text: "¿Qué funciones tiene?", kind: "abierta" as const }] } };
    const ids = (qs: Question[]): string[] => qs.flatMap((q) => [q.id, ...ids(q.branches?.yes ?? []), ...ids(q.branches?.no ?? [])]);
    const all = ids(normalizeQuestions([...existing, added], kindOf));
    expect(new Set(all).size).toBe(all.length);
    expect(all.slice(0, 2)).toEqual(["q1", "q2"]); // existing ids kept
  });
});

describe("question tree: which question she actually asked", () => {
  it("is read from what she said, not from the id she reported", () => {
    const qs = web();
    // The real case: she skipped q1y1 (already answered) and asked the next one.
    expect(matchAsked(qs, "Perfecto, gracias. ¿Y qué es lo que menos te gusta de tu web?")).toBe("q1y2");
    expect(matchAsked(qs, "Gracias, entiendo. Ahora, ¿cómo registran sus ventas?")).toBe("q2");
    expect(matchAsked(qs, "Gracias por tu tiempo, la entrevista terminó.")).toBeUndefined();
  });
});

describe("question tree: intent decided by the app", () => {
  it("gives Emily only the decided branch, or one clarification, then the safe branch", () => {
    const d = normalizeDraft({ locale: "es", questions: web() });
    const yes = turnDirective(d, "q1", 1, false, "yes");
    expect(yes).toContain("[q1y1]");
    expect(yes).not.toMatch(/q1n|gustaría tener una/);
    const no = turnDirective(d, "q1", 1, false, "no");
    expect(no).toContain("[q1n1]");
    expect(no).not.toMatch(/q1y|funciones/);
    expect(turnDirective(d, "q1", 1, false, "unclear")).toMatch(/UNA sola pregunta corta de aclaración/);
    expect(turnDirective(d, "q1", 2, true, "unclear")).toContain("[q1n1]"); // still unclear → no
  });
});

describe("question tree: questions already answered are never asked", () => {
  it("skips them inside the branch and when moving on", () => {
    const d = normalizeDraft({ locale: "es", questions: web() });
    // "Sí, en Wix, la usamos de catálogo…": the functions question (q1y1) is already answered.
    const t = turnDirective(d, "q1", 1, false, "yes", ["q1y1"]);
    expect(t).toContain("[q1y2]");
    expect(t).not.toContain("[q1y1]");
    // Both yes questions answered: straight to the next main question.
    expect(turnDirective(d, "q1", 1, false, "yes", ["q1y1", "q1y2"])).toMatch(/haz la pregunta \[q2\]/);
  });
});
