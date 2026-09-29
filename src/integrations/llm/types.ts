/** Provider-agnostic LLM contract. Add providers by implementing this interface. */
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface LlmProvider {
  readonly name: string;
  /** Returns a JSON string; callers validate it with Zod. */
  completeJson(input: {
    messages: ChatMessage[];
    model?: string;
    temperature?: number;
  }): Promise<string>;
}
