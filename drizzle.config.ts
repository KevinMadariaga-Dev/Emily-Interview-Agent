import { defineConfig } from "drizzle-kit";

// Drizzle Kit config: generates SQL migrations from src/server/db/schema.
export default defineConfig({
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://emily:emily@localhost:5432/emily",
  },
  strict: true,
  verbose: true,
});
