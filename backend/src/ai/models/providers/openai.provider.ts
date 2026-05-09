import type { ProviderConfig, LLMProviderClient, GenerateRequest } from "./types";

type OpenAIChoice = {
  message?: { content?: string };
};

type OpenAIResponse = {
  choices?: OpenAIChoice[];
};

export const createOpenAIProvider = (config: ProviderConfig): LLMProviderClient => {
  const { apiKey, model, baseURL, httpClient } = config;

  return {
    generate: async (request: GenerateRequest) => {
      const data = await httpClient.postJson<OpenAIResponse>(
        `${baseURL}/v1/chat/completions`,
        {
          model,
          messages: [{ role: "user", content: request.prompt }],
          temperature: request.temperature,
          ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
        },
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          source: "OpenAI",
        },
      );

      const content = data.choices?.[0]?.message?.content ?? "";

      return { content };
    },
  };
};
