import "server-only";
import { resendProvider } from "./resend";
import type { EmailProvider } from "./types";

export function getEmailProvider(): EmailProvider {
  return resendProvider;
}
export type { EmailMessage, EmailProvider } from "./types";
