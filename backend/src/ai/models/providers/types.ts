import type { HttpClient } from "@backend/shared/http-client";

export type LLMProvider = "gemini" | "openai" | "anthropic" | "ollama";

export type ProviderConfig = {
  apiKey: string;
  model: string;
  baseURL: string;
  httpClient: HttpClient;
};

export type GenerateRequest = {
  prompt: string;
  temperature: number;
  maxTokens?: number;
  /** Hint to provider that JSON output is expected. Providers that support
   *  native JSON mode (e.g. Ollama `format: "json"`) should use it. */
  format?: "json";
};

export type GenerateResponse = {
  content: string;
};

export type LLMProviderClient = {
  generate: (request: GenerateRequest) => Promise<GenerateResponse>;
};
