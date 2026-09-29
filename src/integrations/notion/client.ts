import "server-only";
import { env, requireEnv } from "@/lib/env";

/**
 * Minimal Notion REST client.
 * - API version >= 2025-09-03 uses *data sources*: pages are created with
 *   parent `{ type: "data_source_id", data_source_id }` instead of `database_id`.
 * - Rate limit ≈ 3 req/s per integration → the job worker processes sequentially
 *   and retries on 429 honoring `Retry-After`.
 * Docs: https://developers.notion.com/reference/post-page
 *
 * TODO(integration):
 *  1. Create an internal integration at https://www.notion.so/profile/integrations → copy secret to NOTION_API_KEY.
 *  2. Create the "Emily Interviews" database with the properties listed in mapper.ts and share it with the integration.
 *  3. GET /v1/databases/<database_id> → copy `data_sources[0].id` to NOTION_DATA_SOURCE_ID.
 */
export async function notionRequest<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${requireEnv("NOTION_API_KEY")}`,
      "Notion-Version": env().NOTION_API_VERSION,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "1");
    throw Object.assign(new Error("Notion rate limited"), { retryAfterSeconds: retryAfter });
  }
  if (!res.ok) throw new Error(`Notion error ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}
