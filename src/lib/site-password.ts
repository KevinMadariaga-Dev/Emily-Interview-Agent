import { timingSafeEqual } from "node:crypto";

/** Constant-time string comparison (no timing hints about how much of a secret matched). */
export function safeEqual(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True when an `Authorization: Basic …` header carries SITE_PASSWORD (any username). */
export function hasSitePassword(header: string | null, password: string) {
  if (!header?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  return safeEqual(decoded.slice(decoded.indexOf(":") + 1), password);
}

/** Paths participants open without the site password: their interview and its voice. */
export const isParticipantPath = (pathname: string) =>
  pathname.startsWith("/e/") || pathname.startsWith("/api/voice/");
