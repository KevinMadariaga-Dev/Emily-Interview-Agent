import "server-only";
import { randomUUID } from "node:crypto";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { isLocale, type Locale } from "@/lib/i18n";
import { getVoiceProvider } from "@/integrations/voice";
import { interviewRepository as repo } from "@/server/repositories/interview.repository";
import { jobRepository } from "@/server/repositories/job.repository";
import { buildGreeting, buildInterviewerPrompt } from "./prompts";

/**
 * Interview use-cases (application layer). Route handlers stay thin and call these.
 * Flow: getPublicLink → startOrResume → createVoiceCredentials → appendTurns* → complete
 */
export const interviewService = {
  /** Public data for the participant landing page (never exposes internal instructions). */
  async getPublicLink(token: string) {
    const found = await repo.findActiveLinkByToken(token);
    if (!found) return null;
    const { link, template } = found;
    const expired = link.expiresAt !== null && link.expiresAt < new Date();
    if (expired || !template.isActive) return null;
    return {
      linkId: link.id,
      title: template.name,
      defaultLocale: template.defaultLocale,
      maxDurationMinutes: template.maxDurationMinutes,
      participantName: link.participantHint?.name ?? null,
    };
  },

  /** Creates a new session or resumes an existing one using the browser's resumeKey. */
  async startOrResume(
    token: string,
    input: { locale?: string; resumeKey?: string; participantName?: string; consent: boolean },
  ) {
    if (!input.consent) throw new ValidationError("Consent is required to start the interview");
    const found = await repo.findActiveLinkByToken(token);
    if (!found) throw new NotFoundError("Interview link not found or inactive");

    if (input.resumeKey) {
      const existing = await repo.findSessionByResumeKey(found.link.id, input.resumeKey);
      if (existing && existing.status !== "completed" && existing.status !== "processed") {
        return repo.updateSession(existing.id, { status: "in_progress" });
      }
    }

    // TODO(limits): enforce link.maxSessions by counting sessions for this link.
    const locale: Locale =
      input.locale && isLocale(input.locale) ? input.locale : found.template.defaultLocale;
    return repo.createSession({
      linkId: found.link.id,
      locale,
      status: "in_progress",
      resumeKey: randomUUID(),
      participantName: input.participantName ?? found.link.participantHint?.name ?? null,
      consentAt: new Date(),
      startedAt: new Date(),
    });
  },

  /**
   * Participant authorization: the resumeKey (returned when the session starts and kept
   * in the participant's browser) acts as a bearer secret for all session endpoints.
   */
  async authorize(sessionId: string, resumeKey: string | null) {
    const session = await repo.findSession(sessionId);
    if (!session || !resumeKey || session.resumeKey !== resumeKey)
      throw new NotFoundError("Session not found");
    return session;
  },

  /** Short-lived credentials so the browser can talk to the voice provider directly. */
  async createVoiceCredentials(sessionId: string) {
    const data = await repo.getSessionWithTemplate(sessionId);
    if (!data || data.session.status !== "in_progress")
      throw new NotFoundError("Active session not found");
    const { session, template } = data;
    return getVoiceProvider().createClientSession({
      sessionId,
      locale: session.locale,
      systemPrompt: buildInterviewerPrompt({
        objective: template.objective,
        questions: template.questions,
        instructions: template.instructions,
        locale: session.locale,
        participantName: session.participantName,
        maxDurationMinutes: template.maxDurationMinutes,
      }),
      greeting: buildGreeting(session.locale, session.participantName),
    });
  },

  async appendTurns(
    sessionId: string,
    turns: { role: "agent" | "participant"; text: string; offsetMs?: number }[],
  ) {
    const session = await repo.findSession(sessionId);
    if (!session) throw new NotFoundError("Session not found");
    await repo.appendTurns(sessionId, turns);
  },

  async pause(sessionId: string) {
    return repo.updateSession(sessionId, { status: "paused" });
  },

  /** Marks the session complete and enqueues the post-processing pipeline. */
  async complete(sessionId: string) {
    const session = await repo.findSession(sessionId);
    if (!session) throw new NotFoundError("Session not found");
    if (session.status === "completed" || session.status === "processed") return session;
    const completedAt = new Date();
    const updated = await repo.updateSession(sessionId, {
      status: "completed",
      completedAt,
      durationSeconds: session.startedAt
        ? Math.round((completedAt.getTime() - session.startedAt.getTime()) / 1000)
        : null,
    });
    // Pipeline step 1. Next steps (email, notion) are enqueued after the summary succeeds.
    await jobRepository.enqueue("generate_summary", sessionId);
    return updated;
  },
};
