// ponytail: in-memory sliding window, per server instance. Swap for Upstash Ratelimit when
// deployed on several instances (plan step 4.1).
const hits = new Map<string, number[]>();

/** true = allowed. `limit` calls per `windowMs` per key. */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  hits.set(key, recent);
  return true;
}

export const clientIp = (h: Headers) =>
  h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
