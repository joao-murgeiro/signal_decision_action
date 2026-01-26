// LLM module: Gemini client

import type { LlmClient } from "./types.js";
import { createGeminiClient } from "./geminiClient.js";

export type { LlmClient, LlmMessage, LlmChatRequest, LlmChatResult } from "./types.js";

export type LlmConfig = {
  provider: "gemini";
  apiKey: string;
};

// Create an LLM client based on config
export function createLlmClient(config: LlmConfig): LlmClient {
  return createGeminiClient(config.apiKey);
}

// Default Gemini model (free tier)
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
