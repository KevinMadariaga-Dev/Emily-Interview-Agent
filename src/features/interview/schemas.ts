import { z } from "zod";

/** Request validation schemas shared by API routes and the client. */
export const startSessionSchema = z.object({
  consent: z.literal(true),
  locale: z.enum(["es", "en"]).optional(),
  participantName: z.string().trim().max(120).optional(),
  resumeKey: z.string().uuid().optional(),
});

export const appendTurnsSchema = z.object({
  turns: z
    .array(
      z.object({
        role: z.enum(["agent", "participant"]),
        text: z.string().trim().min(1).max(5000),
        offsetMs: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1)
    .max(50),
});

export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type AppendTurnsInput = z.infer<typeof appendTurnsSchema>;
