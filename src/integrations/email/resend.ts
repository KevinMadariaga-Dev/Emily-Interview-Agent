import "server-only";
import { env, requireEnv } from "@/lib/env";
import type { EmailProvider } from "./types";

/**
 * Resend transactional email via REST.
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 * TODO(integration): set RESEND_API_KEY, verify your sending domain in Resend,
 * and set EMAIL_FROM to an address on that domain.
 */
export const resendProvider: EmailProvider = {
  name: "resend",
  async send(message, idempotencyKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireEnv("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: env().EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        reply_to: message.replyTo,
      }),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { id: string };
    return json.id;
  },
};
