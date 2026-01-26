import type { LlmChatRequest, LlmChatResult, LlmClient, LlmMessage } from "./types.js";

const DEFAULT_API_VERSION = "v1";
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";

type GeminiContentPart = { text: string };
type GeminiContent = { role: "user" | "model"; parts: GeminiContentPart[] };

// Build a Gemini generateContent payload from chat-style messages.
function buildGeminiPayload(req: LlmChatRequest) {
  const systemParts: GeminiContentPart[] = [];
  const contents: GeminiContent[] = [];

  // Separate system messages so we can merge them into user content later.
  for (const message of req.messages) {
    if (message.role === "system") {
      systemParts.push({ text: message.content });
      continue;
    }

    const role = message.role === "assistant" ? "model" : "user";
    contents.push({ role, parts: [{ text: message.content }] });
  }

  // Gemini v1 does not accept systemInstruction, so prepend system text.
  if (systemParts.length > 0) {
    const systemText = systemParts.map((part) => part.text).join("\n\n");
    if (contents.length > 0 && contents[0]?.role === "user") {
      contents[0].parts = [
        { text: `${systemText}\n\n${contents[0].parts[0]?.text ?? ""}` }
      ];
    } else {
      contents.unshift({
        role: "user",
        parts: [{ text: systemText }]
      });
    }
  }

  const payload: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: req.temperature,
      maxOutputTokens: req.maxTokens
    }
  };

  return payload;
}

// Normalize Gemini response into our LLM result shape.
function parseGeminiResponse(data: any): LlmChatResult {
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts
    ?.map((part: GeminiContentPart) => part.text)
    .filter(Boolean)
    .join("");

  if (!text) {
    throw new Error("gemini_empty_response");
  }

  return {
    content: text,
    usage: {
      inputTokens: data?.usageMetadata?.promptTokenCount,
      outputTokens: data?.usageMetadata?.candidatesTokenCount
    },
    model: data?.model
  };
}

// Create an LLM client that calls Gemini's generateContent endpoint.
export function createGeminiClient(apiKey: string): LlmClient {
  const apiVersion = process.env.GEMINI_API_VERSION ?? DEFAULT_API_VERSION;
  const baseUrl = process.env.GEMINI_API_BASE_URL ?? DEFAULT_BASE_URL;

  return {
    async chat(req: LlmChatRequest): Promise<LlmChatResult> {
      const timeoutMs = req.timeoutMs ?? 30_000;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const payload = buildGeminiPayload(req);
        const url = `${baseUrl}/${apiVersion}/models/${encodeURIComponent(
          req.model
        )}:generateContent?key=${encodeURIComponent(apiKey)}`;

        // Execute the API call with a timeout; any non-2xx is surfaced as error text.
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        // Best-effort JSON parsing, then map error shape if request failed.
        const data: any = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message =
            data?.error?.message ??
            `gemini_error_${response.status}`;
          throw new Error(message);
        }

        return parseGeminiResponse(data);
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
