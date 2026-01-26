import { z } from "zod";
import type { Db } from "../db/db.js";
import type { LlmClient, LlmMessage } from "../llm/index.js";
import { DEFAULT_GEMINI_MODEL } from "../llm/index.js";
import * as holdingsModel from "../models/holdingsModel.js";
import * as decisionsModel from "../models/decisionsModel.js";

const ChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000)
});

type ChatResponse = {
  reply: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};

const SYSTEM_PROMPT = `You are a helpful assistant embedded in a portfolio management app called "Portfolio Sentinel".
You help users understand their US-listed equities (mostly ETFs and Stocks) holdings, portfolio drift, and rebalancing decisions.
You will receive a "Portfolio context" message containing JSON with holdings and decisions.
Always use that context when answering questions, and do not ask the user to repeat data that is already present.
If you need missing data (like current prices), ask only for what is missing and reference the holdings you already have.
If the context has no holdings or decisions, say so. Be concise and friendly.`;

function buildPortfolioContext(db: Db) {
  const holdings = holdingsModel.listHoldings(db).map((holding) => ({
    symbol: holding.symbol,
    label: holding.name,
    shares: holding.shares,
    targetWeight: holding.target_weight
  }));

  const decisions = decisionsModel.listDecisions(db).slice(0, 50).map((decision) => ({
    id: decision.id,
    decisionType: decision.decision_type,
    status: decision.status,
    rationale: decision.rationale,
    payload: JSON.parse(decision.payload_json),
    createdAt: decision.created_at,
    updatedAt: decision.updated_at
  }));

  const rebalanceSuggestions = decisions
    .filter((decision) => decision.decisionType === "portfolio.drift")
    .map((decision) => {
      const payload = decision.payload as {
        symbol?: string;
        targetWeight?: number;
        marketValue?: number;
        portfolioValue?: number;
        lastClose?: number;
      };

      const symbol = payload?.symbol ?? "unknown";
      const portfolioValue = payload?.portfolioValue ?? null;
      const targetWeight = payload?.targetWeight ?? null;
      const marketValue = payload?.marketValue ?? null;
      const lastClose = payload?.lastClose ?? null;

      if (
        portfolioValue === null ||
        targetWeight === null ||
        marketValue === null
      ) {
        return {
          symbol,
          status: "insufficient_data",
          reason: "missing portfolioValue, targetWeight, or marketValue"
        };
      }

      const targetValue = portfolioValue * targetWeight;
      const deltaValue = targetValue - marketValue;
      const sharesDelta =
        lastClose && lastClose > 0 ? deltaValue / lastClose : null;

      return {
        symbol,
        action: deltaValue >= 0 ? "buy" : "sell",
        targetValue: Number(targetValue.toFixed(2)),
        currentValue: Number(marketValue.toFixed(2)),
        deltaValue: Number(deltaValue.toFixed(2)),
        lastClose,
        sharesDelta: sharesDelta !== null ? Number(sharesDelta.toFixed(4)) : null
      };
    });

  return JSON.stringify({
    holdings,
    decisions,
    rebalanceSuggestions,
    summary: {
      holdingsCount: holdings.length,
      decisionsCount: decisions.length
    }
  });
}

// Handle a chat message and return the LLM response.
export async function chat(
  db: Db,
  llmClient: LlmClient,
  body: unknown,
  model?: string
): Promise<{ status: number; body: ChatResponse | { error: string } }> {
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { status: 400, body: { error: "invalid_message" } };
  }

  try {
    const portfolioContext = buildPortfolioContext(db);
    const messages: LlmMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `Portfolio context (JSON):\n${portfolioContext}\nEnd of portfolio context.\n` +
            "Use the holdings/decisions above as the source of truth. " +
            "If rebalanceSuggestions are present, use them directly."
        },
      { role: "user", content: parsed.data.message }
    ];

    if (process.env.LLM_DEBUG === "1") {
      console.log(
        "LLM payload preview:",
        JSON.stringify(
          {
            model: model ?? DEFAULT_GEMINI_MODEL,
            messages
          },
          null,
          2
        )
      );
    }

    const result = await llmClient.chat({
      model: model ?? DEFAULT_GEMINI_MODEL,
      messages,
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
