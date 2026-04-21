import type { ProviderConfig, LLMProviderClient, GenerateRequest } from "./types";

export const createOllamaProvider = (config: ProviderConfig): LLMProviderClient => {
  const { model, baseURL } = config;

  return {
    generate: async (request: GenerateRequest) => {
      const url = `${baseURL}/api/chat`;

      const body: Record<string, unknown> = {
        model,
        messages: [{ role: "user", content: request.prompt }],
        stream: false,
        /**
         * Disable reasoning mode for models that support it (qwen3, gpt-oss, etc.).
         * Without this, reasoning models wrap their entire response in <think>...</think>
         * tags and never emit the actual JSON answer, leaving us with an empty payload.
         */
        think: false,
        /**
         * Ollama native JSON mode — forces the model to output a valid JSON value.
         * Much more reliable than relying on prompt instructions alone.
         */
        ...(request.format === "json" ? { format: "json" } : {}),
        options: {
          temperature: request.temperature,
          ...(request.maxTokens ? { num_ctx: request.maxTokens } : {}),
        },
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Ollama API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const content = data.message?.content ?? "";

      return { content };
    },
  };
};
