import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Administrators who can create interview templates/links and read results. */
export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
