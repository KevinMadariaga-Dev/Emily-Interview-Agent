import "server-only";
import nodemailer from "nodemailer";
import { env, requireEnv } from "@/lib/env";
import type { EmailProvider } from "./types";

/**
 * Gmail via SMTP with an App Password (Google account → Security → 2-Step Verification →
 * App passwords). Docs: https://nodemailer.com/usage/using-gmail/
 * Limits: ~500 recipients/day on a regular Gmail account; use Workspace or Resend beyond that.
 */
export const gmailProvider: EmailProvider = {
  name: "gmail",
  async send(message, idempotencyKey) {
    const user = requireEnv("GMAIL_USER");
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass: requireEnv("GMAIL_APP_PASSWORD").replace(/\s+/g, "") },
    });
    const info = await transport.sendMail({
      from: { name: env().GMAIL_FROM_NAME, address: user },
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo,
      headers: { "X-Entity-Ref-ID": idempotencyKey }, // keeps Gmail from threading reports together
    });
    return info.messageId;
  },
};
