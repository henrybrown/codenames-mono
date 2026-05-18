import type { ProviderConfig, LLMProviderClient, GenerateRequest } from "./types";

type GeminiPart = { text?: string };

type GeminiCandidate = {
  content?: { parts?: GeminiPart[] };
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
};

/**
 * Google Generative Language (Gemini) provider.
 *
 * Reads the first candidate's first part as the response; multi-candidate
 * sampling isn't used by this layer. Empty/missing parts yield an empty
 * content string (not an error).
 */
export const createGeminiProvider = (config: ProviderConfig): LLMProviderClient => {
  const { apiKey, model, baseURL, httpClient } = config;

  return {
    generate: async (request: GenerateRequest) => {
      const data = await httpClient.postJson<GeminiResponse>(
        `${baseURL}/v1beta/models/${model}:generateContent`,
        {
          contents: [{ parts: [{ text: request.prompt }] }],
          generationConfig: {
            temperature: request.temperature,
            ...(request.maxTokens ? { maxOutputTokens: request.maxTokens } : {}),
          },
        },
        {
          headers: { "x-goog-api-key": apiKey },
          source: "Gemini",
        },
      );

      const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

      return { content };
    },
  };
};
