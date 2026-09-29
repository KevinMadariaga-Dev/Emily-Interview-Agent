import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * TEMPORARY admin session: HMAC-signed cookie `emily_admin=<email>.<sig>`.
 * TODO(auth): replace with Better Auth (or Auth.js) using email magic links via Resend,
 * restricted to ADMIN_ALLOWED_EMAILS. Keep the same `getAdminEmail()` contract so pages don't change.
 */
export const ADMIN_COOKIE = "emily_admin";

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createAdminCookieValue(email: string, secret: string) {
  return `${Buffer.from(email).toString("base64url")}.${sign(email, secret)}`;
}

export function verifyAdminCookieValue(
  value: string | undefined,
  secret: string | undefined,
): string | null {
  if (!value || !secret) return null;
  const [encoded, sig] = value.split(".");
  if (!encoded || !sig) return null;
  const email = Buffer.from(encoded, "base64url").toString();
  const expected = Buffer.from(sign(email, secret));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? email : null;
}
