import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InterviewSummary } from "@/features/landing/config";

// Server actions with the database and the admin gate mocked.
const repo = vi.hoisted(() => ({
  list: vi.fn(),
  find: vi.fn(),
  slugsLike: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  setTranslation: vi.fn(),
  listResults: vi.fn(),
  addResult: vi.fn(),
  setResultTranslation: vi.fn(),
}));
const requireAdmin = vi.hoisted(() => vi.fn());
const translateDraft = vi.hoisted(() => vi.fn());
vi.mock("@/features/landing/ai", () => ({ translateDraft }));
vi.mock("@/server/repositories/emily.repository", () => ({ emilyRepository: repo }));
vi.mock("@/server/auth/admin", () => ({ requireAdmin }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const actions = await import("@/features/landing/emilys");

const summary: InterviewSummary = {
  summary: "ok",
  insights: [],
  answers: [{ question: "¿Tienen web?", answer: "Sí", status: "completa" }],
  objective: { met: true, reason: "" },
  keyFacts: [],
  painPoints: [],
  quotes: [],
  nextSteps: [],
  opportunities: [],
};
const saved = {
  slug: "boutique-luna",
  draft: { project: "Boutique Luna", locale: "en", questions: [] },
  translations: {},
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(undefined);
});

describe("Emily server actions", () => {
  it("saves in one language: mixed content is translated to the Emily's language first", async () => {
    repo.slugsLike.mockResolvedValue([]);
    repo.create.mockImplementation(async (v) => v);
    translateDraft.mockResolvedValue({
      project: "Blue Harbor",
      objective: "Learn how they sell online",
      questions: [{ text: "How do you record your sales?", kind: "abierta" }],
      areas: [],
    });
    await actions.createEmily({
      project: "Blue Harbor",
      objective: "Learn how they sell online",
      locale: "en",
      questions: [{ text: "¿Cómo registran sus ventas?", kind: "abierta" }],
    } as never);
    expect(translateDraft).toHaveBeenCalledWith(expect.anything(), "en");
    expect(repo.create.mock.calls[0]![0].draft.questions[0].text).toBe(
      "How do you record your sales?",
    );

    translateDraft.mockClear();
    await actions.createEmily({
      project: "Luna",
      objective: "Saber cómo venden en línea",
      locale: "es",
      questions: ["¿Tienen página web?"],
    } as never);
    expect(translateDraft).not.toHaveBeenCalled(); // already one language
  });

  it("every admin action checks the password first", async () => {
    requireAdmin.mockRejectedValue(new Error("No autorizado."));
    await expect(actions.listSaved()).rejects.toThrow("No autorizado.");
    await expect(actions.createEmily(saved.draft as never)).rejects.toThrow();
    await expect(actions.deleteEmily("boutique-luna")).rejects.toThrow();
    await expect(actions.importBrowserEmilys([])).rejects.toThrow();
    await expect(
      actions.saveEmilyTranslation("boutique-luna", "en", { project: "", objective: "" }),
    ).rejects.toThrow();
    expect(repo.list).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it("creates under the first free slug of the project name", async () => {
    repo.slugsLike.mockResolvedValue(["boutique-luna", "boutique-luna-2"]);
    repo.create.mockImplementation(async (v) => v);
    expect(await actions.createEmily({ project: "Boutique Luna" } as never)).toBe(
      "boutique-luna-3",
    );
  });

  it("the public result save uses the saved Emily's project and language", async () => {
    repo.find.mockResolvedValue(saved);
    const history = [
      { role: "emily" as const, text: "¿Tienen web?" },
      { role: "participant" as const, text: "Sí, Shopify.", q: 0 },
    ];
    await actions.saveInterviewResult("boutique-luna", summary, history);
    expect(requireAdmin).not.toHaveBeenCalled(); // participants have no password
    expect(repo.addResult).toHaveBeenCalledWith(
      expect.objectContaining({
        emilySlug: "boutique-luna",
        project: "Boutique Luna",
        locale: "en",
      }),
    );
  });

  it("rejects results for unknown Emilys, bad slugs and invalid summaries", async () => {
    repo.find.mockResolvedValue(null);
    await expect(actions.saveInterviewResult("nope", summary, [])).rejects.toThrow();
    await expect(actions.saveInterviewResult("../x", summary, [])).rejects.toThrow();
    repo.find.mockResolvedValue(saved);
    await expect(
      actions.saveInterviewResult("boutique-luna", { summary: 1 } as never, []),
    ).rejects.toThrow();
    await expect(
      actions.saveInterviewResult("boutique-luna", summary, [
        { role: "hacker", text: "x" },
      ] as never),
    ).rejects.toThrow();
    expect(repo.addResult).not.toHaveBeenCalled();
  });

  it("imports browser Emilys, skipping existing ones and very old results", async () => {
    repo.create.mockResolvedValueOnce({}).mockResolvedValueOnce(null);
    const n = await actions.importBrowserEmilys([
      { slug: "a", draft: { project: "A" }, results: [{ at: "x", summary, turns: 2 }, { old: 1 }] },
      { slug: "b", draft: { project: "B" } },
    ]);
    expect(n).toBe(1);
    expect(repo.addResult).toHaveBeenCalledTimes(1);
  });
});
