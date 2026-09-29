import "server-only";
import { env, requireEnv } from "@/lib/env";
import type { LlmProvider } from "./types";

/**
 * OpenAI Chat Completions via fetch (no SDK dependency).
 * Docs: https://platform.openai.com/docs/api-reference/chat
 * TODO(integration): set OPENAI_API_KEY and LLM_MODEL in .env.local.
 */
export const openAiProvider: LlmProvider = {
  name: "openai",
  async completeJson({ messages, model, temperature = 0.2 }) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model ?? env().LLM_MODEL,
        temperature,
        response_format: { type: "json_object" },
        messages,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    return json.choices[0]?.message.content ?? "{}";
  },
};
