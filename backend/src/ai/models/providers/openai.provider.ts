import type { ProviderConfig, LLMProviderClient, GenerateRequest } from "./types";

export const createOpenAIProvider = (config: ProviderConfig): LLMProviderClient => {
  const { apiKey, model, baseURL } = config;

  return {
    generate: async (request: GenerateRequest) => {
      const url = `${baseURL}/v1/chat/completions`;

      const body: Record<string, unknown> = {
        model,
        messages: [{ role: "user", content: request.prompt }],
        temperature: request.temperature,
        ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? "";

      return { content };
    },
  };
};
