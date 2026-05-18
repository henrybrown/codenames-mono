import type { HttpClient } from "@backend/shared/http-client";

/** Supported LLM providers; one of these tags the configured client. */
export type LLMProvider = "gemini" | "openai" | "anthropic" | "ollama";

/** Per-provider wiring inputs — credentials, target model, transport. */
export type ProviderConfig = {
  apiKey: string;
  model: string;
  baseURL: string;
  httpClient: HttpClient;
};

/**
 * Normalized generation request passed to every provider.
 *
 * `temperature` is required (the universal layer always supplies a default);
 * `maxTokens` is optional and may be ignored by providers that don't accept it.
 */
export type GenerateRequest = {
  prompt: string;
  temperature: number;
  maxTokens?: number;
  /** Hint to provider that JSON output is expected. Providers that support
   *  native JSON mode (e.g. Ollama `format: "json"`) should use it. */
  format?: "json";
};

/** Provider response after content extraction; multi-block payloads are concatenated. */
export type GenerateResponse = {
  content: string;
};

/**
 * The narrow interface every provider implementation conforms to.
 *
 * Throws on transport, HTTP, or shape failures; returning a value implies
 * the provider produced a (possibly empty) string.
 */
export type LLMProviderClient = {
  generate: (request: GenerateRequest) => Promise<GenerateResponse>;
};
