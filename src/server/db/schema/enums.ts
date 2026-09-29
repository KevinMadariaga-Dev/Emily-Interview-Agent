import { pgEnum } from "drizzle-orm/pg-core";

export const localeEnum = pgEnum("locale", ["es", "en"]);

export const sessionStatusEnum = pgEnum("session_status", [
  "created", // link opened, consent pending
  "in_progress", // voice conversation running
  "paused", // participant left; can resume with the same link
  "completed", // interview finished, awaiting processing
  "processed", // summary generated + deliveries queued
  "abandoned", // timed out without completion
]);

export const turnRoleEnum = pgEnum("turn_role", ["agent", "participant", "system"]);

export const jobTypeEnum = pgEnum("job_type", ["generate_summary", "send_email", "sync_notion"]);

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
  "dead",
]);
