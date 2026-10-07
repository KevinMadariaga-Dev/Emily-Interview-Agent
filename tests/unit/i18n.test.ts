import { describe, expect, it } from "vitest";
import { voices, presets } from "@/features/landing/config";
import { dict } from "@/features/landing/i18n";
import { reportLabels } from "@/features/landing/report-i18n";

/** Every leaf path of a strings object; functions are called with sample args. */
function leaves(obj: Record<string, unknown>, prefix = ""): [string, string][] {
  return Object.entries(obj).flatMap(([k, v]): [string, string][] => {
    const path = prefix + k;
    if (typeof v === "function") return [[path, String(v(2, "X", 1))]];
    if (Array.isArray(v)) return v.flatMap((x, i) => leaves({ [i]: x }, `${path}.`));
    if (v && typeof v === "object") return leaves(v as Record<string, unknown>, `${path}.`);
    return [[path, String(v)]];
  });
}
// Spanish-only marks; English text must not contain them (catches untranslated strings).
const SPANISH =
  /[¿¡ñáéíóú]|\b(?:de|que|el|del|con|las|los|una|para|pregunta|respuesta|Objetivo)\b/i;

describe.each([
  ["landing UI", dict.es, dict.en],
  ["reports", reportLabels("es"), reportLabels("en")],
])("%s strings", (_, es, en) => {
  const esL = leaves(es as Record<string, unknown>);
  const enL = leaves(en as Record<string, unknown>);

  it("have the same keys in Spanish and English", () => {
    expect(enL.map(([k]) => k)).toEqual(esL.map(([k]) => k));
  });

  it("English has no Spanish left", () => {
    expect(enL.filter(([, v]) => SPANISH.test(v))).toEqual([]);
  });
});

describe("bilingual config", () => {
  it("every voice and preset has both languages", () => {
    for (const v of voices) expect(v.desc.es && v.desc.en).toBeTruthy();
    for (const p of presets) expect(p.en.label && p.en.context).toBeTruthy();
  });

  it("unknown locales fall back to Spanish report labels", () => {
    expect(reportLabels("xx" as "es")).toBe(reportLabels("es"));
  });
});
