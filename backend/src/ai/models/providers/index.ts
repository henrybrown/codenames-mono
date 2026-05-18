import type { LLMProvider, ProviderConfig, LLMProviderClient } from "./types";
import { createGeminiProvider } from "./gemini.provider";
import { createOpenAIProvider } from "./openai.provider";
import { createAnthropicProvider } from "./anthropic.provider";
import { createOllamaProvider } from "./ollama.provider";

const factories: Record<LLMProvider, (config: ProviderConfig) => LLMProviderClient> = {
  gemini: createGeminiProvider,
  openai: createOpenAIProvider,
  anthropic: createAnthropicProvider,
  ollama: createOllamaProvider,
};

/**
 * Builds a provider client from the tagged provider name.
 *
 * Throws `Error` if the tag isn't in the supported set; the message lists
 * the registered providers so caller logs are self-explanatory.
 */
export const createProvider = (provider: LLMProvider, config: ProviderConfig): LLMProviderClient => {
  const factory = factories[provider];
  if (!factory) {
    throw new Error(`Unknown LLM provider "${provider}". Supported: ${Object.keys(factories).join(", ")}`);
  }
  return factory(config);
};

export type { LLMProvider, ProviderConfig, LLMProviderClient } from "./types";
