import { z } from "zod";
import type { LlmClient } from "../llm/index.js";
import { DEFAULT_GEMINI_MODEL } from "../llm/index.js";

const ChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000)
});

type ChatResponse = {
  reply: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};

const SYSTEM_PROMPT = `You are a helpful assistant embedded in a portfolio management app called "Portfolio Sentinel".
You help users understand their US-listed equities (mostly ETFs and Stocks) holdings, portfolio drift, and rebalancing decisions.
Be concise and friendly. If asked about specific portfolio data you don't have, say so.`;

// Handle a chat message and return the LLM response.
export async function chat(
  llmClient: LlmClient,
  body: unknown,
  model?: string
): Promise<{ status: number; body: ChatResponse | { error: string } }> {
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { status: 400, body: { error: "invalid_message" } };
  }

  try {
    const result = await llmClient.chat({
      model: model ?? DEFAULT_GEMINI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: parsed.data.message }
      ],
      temperature: 0.7,
      maxTokens: 1024,
      timeoutMs: 30_000
    });

    return {
      status: 200,
      body: {
        reply: result.content,
        usage: result.usage
      }
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "llm_error";
    console.error("Chat error:", message);
    return { status: 500, body: { error: message } };
  }
}
