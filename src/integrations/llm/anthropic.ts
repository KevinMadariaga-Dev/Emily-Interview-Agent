import "server-only";
import { env, requireEnv } from "@/lib/env";
import type { LlmProvider } from "./types";

/**
 * Anthropic Messages API via fetch.
 * Docs: https://docs.claude.com/en/api/messages
 * TODO(integration): set ANTHROPIC_API_KEY, LLM_PROVIDER=anthropic and a Claude model in LLM_MODEL.
 */
export const anthropicProvider: LlmProvider = {
  name: "anthropic",
  async completeJson({ messages, model, temperature = 0.2 }) {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": requireEnv("ANTHROPIC_API_KEY"),
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model ?? env().LLM_MODEL,
        max_tokens: 4096,
        temperature,
        system: `${system}\n\nRespond with a single valid JSON object only.`,
        messages: messages.filter((m) => m.role !== "system"),
      }),
    });
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { content: { type: string; text?: string }[] };
    return json.content.find((c) => c.type === "text")?.text ?? "{}";
  },
};
