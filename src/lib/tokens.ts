import { randomBytes } from "node:crypto";

/** URL-safe, unguessable token for shareable interview links (e.g. /i/<token>). */
export function createShareToken(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}
