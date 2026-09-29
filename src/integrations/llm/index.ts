import "server-only";
import { env } from "@/lib/env";
import { anthropicProvider } from "./anthropic";
import { openAiProvider } from "./openai";
import type { LlmProvider } from "./types";

/** Factory: pick provider from LLM_PROVIDER. */
export function getLlm(): LlmProvider {
  return env().LLM_PROVIDER === "anthropic" ? anthropicProvider : openAiProvider;
}

export type { ChatMessage, LlmProvider } from "./types";
