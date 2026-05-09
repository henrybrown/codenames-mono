/**
 * Models — infra layer for the AI feature
 *
 * Turns `LLMConfig` + an injected HttpClient into a usable LLM client.
 * This is the only sub-module that knows about specific providers
 * (OpenAI, Anthropic, Gemini, Ollama). Everything below this layer
 * (pipeline, player, move) treats the LLM as an opaque service.
 */

import type { AppLogger } from "@backend/shared/logging";
import type { HttpClient } from "@backend/shared/http-client";
import { createLLMService } from "./llm.service";
import type { LLMConfig } from "./llm.service";

export type { LLMConfig, LLMService } from "./llm.service";
export type { LLMProvider } from "./providers";
export type { HealthState, HealthPlacement } from "./ai-health";

export interface ModelsDependencies {
  config: LLMConfig;
  httpClient: HttpClient;
}

export const createModels = (logger: AppLogger) => (deps: ModelsDependencies) => {
  const llm = createLLMService(deps.config, deps.httpClient, logger);
  return {
    llm,
  };
};

export type Models = ReturnType<ReturnType<typeof createModels>>;
