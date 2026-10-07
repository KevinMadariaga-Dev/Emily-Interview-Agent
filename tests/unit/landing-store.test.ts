import { beforeEach, describe, expect, it } from "vitest";
import type { Draft } from "@/features/landing/config";

// Minimal browser storage for the node test environment.
const mem = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
  window: { dispatchEvent: () => true },
});

const { deleteEmily, loadEmily, saveEmily, saveResult, saveResultTranslation, uniqueSlug } =
  await import("@/features/landing/store");

const draft = { project: "Boutique Luna", questions: [] } as unknown as Draft;
const summary = {
  summary: "ok",
  insights: [],
  answers: [],
  objective: { met: true, reason: "" },
  keyFacts: [],
  painPoints: [],
  quotes: [],
  nextSteps: [],
};

describe("landing store", () => {
  beforeEach(() => mem.clear());

  it("saves under the project slug and keeps names unique", () => {
    expect(uniqueSlug("boutique-luna")).toBe("boutique-luna");
    saveEmily("boutique-luna", draft);
    expect(uniqueSlug("boutique-luna")).toBe("boutique-luna-2");
    saveEmily("boutique-luna-2", draft);
    expect(uniqueSlug("boutique-luna")).toBe("boutique-luna-3");
    expect(loadEmily("boutique-luna")?.project).toBe("Boutique Luna");
    expect(JSON.parse(mem.get("emily:list")!)).toEqual(["boutique-luna-2", "boutique-luna"]);
  });

  it("saves the interview language and caches a translated summary once", () => {
    saveResult("t", "T", summary, 2, "es");
    const [r] = JSON.parse(mem.get("emily:results:t")!);
    expect(r.locale).toBe("es");
    saveResultTranslation("t", r.at, "en", { ...summary, summary: "translated" });
    const [after] = JSON.parse(mem.get("emily:results:t")!);
    expect(after.summary.summary).toBe("ok"); // original untouched
    expect(after.translations.en.summary).toBe("translated");
  });

  it("deletes the Emily and its results", () => {
    saveEmily("x", draft);
    saveResult("x", "X", summary, 4, "es");
    expect(mem.has("emily:results:x")).toBe(true);
    deleteEmily("x");
    expect(loadEmily("x")).toBeNull();
    expect(mem.has("emily:results:x")).toBe(false);
    expect(JSON.parse(mem.get("emily:list")!)).toEqual([]);
  });
});
