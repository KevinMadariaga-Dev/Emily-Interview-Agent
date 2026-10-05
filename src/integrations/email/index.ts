import "server-only";
import { env } from "@/lib/env";
import { gmailProvider } from "./gmail";
import { resendProvider } from "./resend";
import type { EmailProvider } from "./types";

const gmailReady = () => !!(env().GMAIL_USER && env().GMAIL_APP_PASSWORD);

/** Gmail when its App Password is set, otherwise Resend. */
export function getEmailProvider(): EmailProvider {
  return gmailReady() ? gmailProvider : resendProvider;
}

/** Which provider can actually send right now (null = none configured). */
export function emailProviderName(): "gmail" | "resend" | null {
  if (gmailReady()) return "gmail";
  return env().RESEND_API_KEY ? "resend" : null;
}
export type { EmailMessage, EmailProvider } from "./types";
