import { beforeEach, describe, expect, it, vi } from "vitest";
import { isOpen, normalizeDraft } from "@/features/landing/config";

// Public/admin AI actions with the database, auth and LLM mocked.
const repo = vi.hoisted(() => ({ find: vi.fn() }));
const requireAdmin = vi.hoisted(() => vi.fn());
vi.mock("@/server/repositories/emily.repository", () => ({ emilyRepository: repo }));
vi.mock("@/server/auth/admin", () => ({ requireAdmin }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/integrations/llm", () => ({ getLlm: () => ({ completeJson: vi.fn() }) }));

const ai = await import("@/features/landing/ai");

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(undefined);
});

describe("untrusted drafts are typed and bounded", () => {
  it("drops wrong types and cuts oversized fields", () => {
    const d = normalizeDraft({
      project: { evil: true },
      objective: "x".repeat(5000),
      questions: [{ text: "¿Tienen web?", kind: "<script>" }, 42, "y".repeat(900)],
      areas: ["pagos", 7, "z".repeat(200)],
      noExpiry: "yes",
      voice: "onyx",
    });
    expect(d.project).toBe("");
    expect(d.objective).toHaveLength(800);
    expect(d.questions).toHaveLength(2);
    expect(d.questions[0]!.kind).toBe("abierta");
    expect(d.questions[1]!.text).toHaveLength(300);
    expect(d.areas).toEqual(["pagos", "z".repeat(60)]);
    expect(d.noExpiry).toBe(false);
    expect(d.voice).toBe("marin");
  });

  it("caps the number of questions and areas", () => {
    const d = normalizeDraft({
      questions: Array(40).fill("¿Pregunta?"),
      areas: Array(40).fill("a"),
    });
    expect(d.questions).toHaveLength(15);
    expect(d.areas).toHaveLength(10);
  });
});

describe("paused and expired links", () => {
  const base = normalizeDraft({ project: "P" });
  it("are open by default, closed when paused or past the expiry day", () => {
    const now = new Date("2026-10-12T12:00:00");
    expect(isOpen(base, now)).toBe(true);
    expect(isOpen({ ...base, status: "paused" }, now)).toBe(false);
    expect(isOpen({ ...base, expires: "2026-10-12" }, now)).toBe(true); // until end of day
    expect(isOpen({ ...base, expires: "2026-10-11" }, now)).toBe(false);
    expect(isOpen({ ...base, expires: "2026-10-11", noExpiry: true }, now)).toBe(true);
  });
});

describe("public interview actions use the saved Emily, never the browser's", () => {
  it("refuse unknown, malformed, paused and expired Emilys", async () => {
    repo.find.mockResolvedValue(null);
    await expect(ai.interviewTurn("nope", [])).rejects.toThrow("no está disponible");
    await expect(ai.interviewTurn("../etc", [])).rejects.toThrow();
    repo.find.mockResolvedValue({ draft: { project: "P", status: "paused" } });
    await expect(ai.interviewTurn("p", [])).rejects.toThrow();
    await expect(ai.summarizeInterview("p", [])).rejects.toThrow();
    repo.find.mockResolvedValue({ draft: { project: "P", expires: "2000-01-01" } });
    await expect(ai.interviewTurn("p", [])).rejects.toThrow();
  });

  it("run for an open Emily (presentation first)", async () => {
    repo.find.mockResolvedValue({ draft: { project: "P", questions: ["¿Tienen web?"] } });
    const next = await ai.interviewTurn("p", []);
    expect(next.asking).toBe(-1);
    expect(repo.find).toHaveBeenCalledWith("p");
  });
});

describe("admin-only AI actions", () => {
  it("check the site password before spending on the LLM", async () => {
    requireAdmin.mockRejectedValue(new Error("No autorizado."));
    await expect(ai.refineQuestions({} as never)).rejects.toThrow();
    await expect(ai.translateDraft({} as never, "en")).rejects.toThrow();
    await expect(ai.translateSummary({} as never, "en")).rejects.toThrow();
    await expect(ai.generateFromPreset("tienda" as never, "", "es")).rejects.toThrow();
  });
});
