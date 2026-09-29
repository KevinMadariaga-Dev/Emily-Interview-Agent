"use client";

import type { AppendTurnsInput, StartSessionInput } from "../schemas";

/** Typed browser client for the interview API. */
async function request<T>(
  url: string,
  init: RequestInit & { resumeKey?: string } = {},
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.resumeKey ? { "x-resume-key": init.resumeKey } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const interviewApi = {
  start: (token: string, input: StartSessionInput) =>
    request<{ sessionId: string; resumeKey: string; locale: "es" | "en" }>(
      `/api/interviews/${token}/sessions`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    ),
  voiceToken: (sessionId: string, resumeKey: string) =>
    request<{ provider: string; token: string; agentSettings: Record<string, unknown> }>(
      `/api/sessions/${sessionId}/voice-token`,
      { method: "POST", resumeKey },
    ),
  appendTurns: (sessionId: string, resumeKey: string, turns: AppendTurnsInput["turns"]) =>
    request<void>(`/api/sessions/${sessionId}/turns`, {
      method: "POST",
      resumeKey,
      body: JSON.stringify({ turns }),
    }),
  pause: (sessionId: string, resumeKey: string) =>
    request<void>(`/api/sessions/${sessionId}/pause`, {
      method: "POST",
      resumeKey,
      keepalive: true,
    }),
  complete: (sessionId: string, resumeKey: string) =>
    request<{ status: string }>(`/api/sessions/${sessionId}/complete`, {
      method: "POST",
      resumeKey,
    }),
};
