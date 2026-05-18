import type { ProviderConfig, LLMProviderClient, GenerateRequest } from "./types";

type OllamaResponse = {
  message?: { content?: string };
};

/**
 * Ollama chat-completions provider.
 *
 * Opts into native JSON mode when `format: "json"` is requested and disables
 * provider-side reasoning chains (`think: false`) — reasoning-tuned models
 * otherwise wrap their reply in `<think>...</think>` and never emit the
 * payload.
 */
export const createOllamaProvider = (config: ProviderConfig): LLMProviderClient => {
  const { model, baseURL, httpClient } = config;

  return {
    generate: async (request: GenerateRequest) => {
      const data = await httpClient.postJson<OllamaResponse>(
        `${baseURL}/api/chat`,
        {
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
        },
        { source: "Ollama" },
      );

      const content = data.message?.content ?? "";

      return { content };
    },
  };
};
