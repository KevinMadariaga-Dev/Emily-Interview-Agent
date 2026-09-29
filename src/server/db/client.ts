import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * Lazily-created singleton. Reused across hot reloads in dev (globalThis)
 * to avoid exhausting connections. For serverless prod use a pooled URL
 * (Neon "-pooler" host / Supabase transaction pooler).
 */
const globalForDb = globalThis as unknown as { __emilyDb?: Database };

export function db(): Database {
  if (!globalForDb.__emilyDb) {
    const client = postgres(env().DATABASE_URL, { max: 5, prepare: false });
    globalForDb.__emilyDb = drizzle(client, { schema, casing: "snake_case" });
  }
  return globalForDb.__emilyDb;
}

export { schema };
