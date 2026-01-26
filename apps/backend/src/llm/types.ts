// Provider-agnostic LLM types

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmChatRequest = {
  model: string;
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

export type LlmChatResult = {
  content: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  model?: string;
  raw?: unknown;
};

export interface LlmClient {
  chat(req: LlmChatRequest): Promise<LlmChatResult>;
}
