import type { ProviderConfig, LLMProviderClient, GenerateRequest } from "./types";

type AnthropicContentBlock = { type: string; text?: string };

type AnthropicResponse = {
  content?: AnthropicContentBlock[];
};

export const createAnthropicProvider = (config: ProviderConfig): LLMProviderClient => {
  const { apiKey, model, baseURL, httpClient } = config;

  return {
    generate: async (request: GenerateRequest) => {
      const data = await httpClient.postJson<AnthropicResponse>(
        `${baseURL}/v1/messages`,
        {
          model,
          messages: [{ role: "user", content: request.prompt }],
          temperature: request.temperature,
          max_tokens: request.maxTokens ?? 4096,
        },
        {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          source: "Anthropic",
        },
      );

      const content = (data.content ?? [])
        .filter((block): block is Required<AnthropicContentBlock> =>
          block.type === "text" && typeof block.text === "string",
        )
        .map((block) => block.text)
        .join("");

      return { content };
    },
  };
};
