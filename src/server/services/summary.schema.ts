import { z } from "zod";

/** Contract for the LLM output. Anything not matching is rejected and retried. */
export const interviewSummarySchema = z.object({
  executiveSummary: z.string().min(1),
  painPoints: z.array(z.string()).default([]),
  insights: z.array(z.string()).default([]),
  quotes: z.array(z.string()).default([]),
  nextSteps: z.array(z.string()).default([]),
  sentiment: z.enum(["positive", "neutral", "negative", "mixed"]),
  objectiveMet: z.boolean(),
  /** Per-question answers keyed by template question id. */
  answers: z.array(z.object({ questionId: z.string(), answer: z.string() })).default([]),
});

export type InterviewSummary = z.infer<typeof interviewSummarySchema>;
