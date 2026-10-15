/** Provider-agnostic LLM contract. Add providers by implementing this interface. */
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface LlmProvider {
  readonly name: string;
  /** Returns a JSON string; callers validate it with Zod. */
  completeJson(input: {
    messages: ChatMessage[];
    model?: string;
    temperature?: number;
    /** Reasoning models: overrides LLM_REASONING_EFFORT (e.g. "minimal" for quick reads). */
    reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
  }): Promise<string>;
}
