import type { ProviderConfig, LLMProviderClient, GenerateRequest } from "./types";

export const createAnthropicProvider = (config: ProviderConfig): LLMProviderClient => {
  const { apiKey, model, baseURL } = config;

  return {
    generate: async (request: GenerateRequest) => {
      const url = `${baseURL}/v1/messages`;

      const body: Record<string, unknown> = {
        model,
        messages: [{ role: "user", content: request.prompt }],
        temperature: request.temperature,
        max_tokens: request.maxTokens ?? 4096,
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const content = (data.content ?? [])
        .filter((block: { type: string }) => block.type === "text")
        .map((block: { text: string }) => block.text)
        .join("");

      return { content };
    },
  };
};
