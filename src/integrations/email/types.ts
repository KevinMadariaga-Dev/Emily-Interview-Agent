export type EmailMessage = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

export interface EmailProvider {
  readonly name: string;
  /** Returns the provider message id. `idempotencyKey` prevents duplicates on retries. */
  send(message: EmailMessage, idempotencyKey: string): Promise<string>;
}
