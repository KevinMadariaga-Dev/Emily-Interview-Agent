import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Draft, InterviewSummary } from "@/features/landing/config";

// The client store talks to the database through server actions: mocked here.
const actions = vi.hoisted(() => ({
  listSaved: vi.fn(),
  createEmily: vi.fn(),
  deleteEmily: vi.fn(),
  saveEmilyTranslation: vi.fn(),
  saveResultTranslation: vi.fn(),
  saveInterviewResult: vi.fn(),
  importBrowserEmilys: vi.fn(),
}));
vi.mock("@/features/landing/emilys", () => actions);

const mem = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
  window: { dispatchEvent: () => true, addEventListener() {}, removeEventListener() {} },
  StorageEvent: class extends Event {},
});

const store = await import("@/features/landing/store");

const summary = {
  summary: "ok",
  insights: [],
  answers: [],
  objective: { met: true, reason: "" },
  keyFacts: [],
  painPoints: [],
  quotes: [],
  nextSteps: [],
} satisfies InterviewSummary;
const draft = { project: "Boutique Luna", questions: [], locale: "es" } as unknown as Draft;
const emily = { slug: "boutique-luna", draft, createdAt: "2026-10-01T00:00:00.000Z" };
const result = {
  id: "r1",
  slug: "boutique-luna",
  project: "Boutique Luna",
  at: "2026-10-02T00:00:00.000Z",
  summary,
  turns: 4,
  locale: "es" as const,
};

beforeEach(() => {
  mem.clear();
  vi.clearAllMocks();
  actions.listSaved.mockResolvedValue({ emilys: [emily], results: [result] });
});

describe("landing store (database-backed)", () => {
  it("creates through the server, which picks the slug, then reloads", async () => {
    actions.createEmily.mockResolvedValue("boutique-luna-2");
    expect(await store.saveEmily(draft)).toBe("boutique-luna-2");
    expect(actions.createEmily).toHaveBeenCalledWith(draft);
    expect(actions.listSaved).toHaveBeenCalled();
  });

  it("deletes optimistically and reloads from the server", async () => {
    await store.reloadSaved();
    actions.listSaved.mockResolvedValue({ emilys: [], results: [] });
    actions.deleteEmily.mockResolvedValue(undefined);
    await store.deleteEmily("boutique-luna");
    expect(actions.deleteEmily).toHaveBeenCalledWith("boutique-luna");
  });

  it("saves a result by slug only (project and language are the server's)", async () => {
    await store.saveResult("boutique-luna", summary, 4);
    expect(actions.saveInterviewResult).toHaveBeenCalledWith("boutique-luna", summary, 4);
  });

  it("caches translations on the server by id / slug", async () => {
    await store.saveResultTranslation("r1", "en", { ...summary, summary: "translated" });
    expect(actions.saveResultTranslation).toHaveBeenCalledWith("r1", "en", expect.anything());
    await store.saveEmilyTranslation("boutique-luna", "en", { project: "P", objective: "O" });
    expect(actions.saveEmilyTranslation).toHaveBeenCalledWith("boutique-luna", "en", {
      project: "P",
      objective: "O",
    });
  });
});

describe("one-time import of pre-database Emilys", () => {
  it("reads wrapped and bare (older) drafts with their results", () => {
    mem.set("emily:list", JSON.stringify(["a", "b", "gone"]));
    mem.set("emily:config:a", JSON.stringify({ slug: "a", draft, createdAt: "2026-09-01" }));
    mem.set("emily:config:b", JSON.stringify(draft)); // bare draft
    mem.set("emily:results:a", JSON.stringify([{ at: "2026-09-02", summary, turns: 3 }]));
    const items = store.browserEmilys();
    expect(items.map((i) => i.slug)).toEqual(["a", "b"]);
    expect(items[0]).toMatchObject({ createdAt: "2026-09-01", results: [{ turns: 3 }] });
    expect(items[1]).toMatchObject({ draft, results: [] });
  });

  it("imports once, keeps the local copy and marks the browser as imported", async () => {
    mem.set("emily:list", JSON.stringify(["a"]));
    mem.set("emily:config:a", JSON.stringify({ slug: "a", draft }));
    actions.importBrowserEmilys.mockResolvedValue(1);
    expect(await store.importBrowserEmilys()).toBe(1);
    expect(mem.has("emily:config:a")).toBe(true);
    expect(store.browserEmilys()).toEqual([]);
  });
});
