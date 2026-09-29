import { describe, expect, it } from "vitest";
import { interviewSummarySchema } from "@/server/services/summary.schema";
import { buildInterviewerPrompt } from "@/server/services/prompts";

describe("interviewSummarySchema", () => {
  it("accepts a valid LLM payload and fills defaults", () => {
    const parsed = interviewSummarySchema.parse({
      executiveSummary: "ok",
      sentiment: "neutral",
      objectiveMet: true,
    });
    expect(parsed.painPoints).toEqual([]);
  });
  it("rejects an invalid sentiment", () => {
    expect(() =>
      interviewSummarySchema.parse({
        executiveSummary: "x",
        sentiment: "angry",
        objectiveMet: true,
      }),
    ).toThrow();
  });
});

describe("buildInterviewerPrompt", () => {
  it("includes the objective and every question id", () => {
    const prompt = buildInterviewerPrompt({
      objective: "Find pain points",
      questions: [
        { id: "q1", text: "What?" },
        { id: "q2", text: "Why?" },
      ],
      locale: "es",
      maxDurationMinutes: 15,
    });
    expect(prompt).toContain("Find pain points");
    expect(prompt).toContain("[q1]");
    expect(prompt).toContain("[q2]");
  });
});
