/**
 * Universal LLM Service using native provider APIs
 *
 * Supports multiple providers via native fetch:
 * - Gemini:    Google Generative Language API
 * - OpenAI:    Chat Completions API
 * - Anthropic: Messages API
 * - Ollama:    Chat API
 */

import { createProvider } from "./providers";
import type { LLMProvider } from "./providers";
import type { AppLogger } from "@backend/shared/logging";
import type { HttpClient } from "@backend/shared/http-client";
import { createAiHealthMonitor, type AiHealthMonitor } from "./ai-health";

/**
 * Configuration for the LLM client.
 *
 * `temperature` and `maxTokens` are defaults that callers can override per
 * request. `healthCheck` only takes effect for the `ollama` provider; for
 * remote providers it's ignored (runtime placement isn't observable).
 */
export type LLMConfig = {
  providerName: LLMProvider;
  baseURL: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  healthCheck?: {
    enabled: boolean;
    throttleMs: number;
    gpuThreshold: number;
  };
};

/**
 * Per-request generation parameters.
 *
 * `format: "json"` opts into provider-native JSON mode where supported
 * (currently Ollama). Other providers ignore the hint and rely on the
 * prompt to request JSON.
 */
export type LLMGenerateOptions = {
  prompt: string;
  format?: "json";
  temperature?: number;
  maxTokens?: number;
};

/**
 * Builds the universal LLM client.
 *
 * Exposes `generate` (returns raw text), `generateJSON` (strips common
 * provider artifacts — markdown fences, `<think>` blocks — then parses),
 * and health probe accessors that no-op for non-Ollama providers.
 *
 * Throws on transport, HTTP, or JSON-parse failures from `generateJSON`.
 */
export const createLLMService = (
  config: LLMConfig,
  httpClient: HttpClient,
  logger: AppLogger,
) => {
  const {
    providerName: provider,
    baseURL,
    apiKey,
    model,
    temperature = 0.7,
    maxTokens = 4096,
  } = config;

  const client = createProvider(provider, { apiKey, model, baseURL, httpClient });

  const monitor: AiHealthMonitor | null =
    provider === "ollama" && config.healthCheck?.enabled
      ? createAiHealthMonitor(
          {
            baseURL,
            model,
            throttleMs: config.healthCheck.throttleMs,
            gpuThreshold: config.healthCheck.gpuThreshold,
          },
          httpClient,
          logger,
        )
      : null;

  let requestCount = 0;

  const generate = async (options: LLMGenerateOptions): Promise<string> => {
    const requestId = ++requestCount;
    const startTime = Date.now();
    const effectiveTemp = options.temperature ?? temperature;
    const effectiveMaxTokens = options.maxTokens ?? maxTokens;
    const promptLength = options.prompt.length;

    logger.debug("llm.generate request", {
      requestId,
      model,
      temperature: effectiveTemp,
      promptChars: promptLength,
    });

    try {
      const response = await client.generate({
        prompt: options.prompt,
        temperature: effectiveTemp,
        maxTokens: effectiveMaxTokens,
        format: options.format,
      });

      const elapsed = Date.now() - startTime;
      const content = response.content;

      logger.debug("llm.generate success", {
        requestId,
        contentChars: content.length,
        elapsedMs: elapsed,
      });

      return content;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      logger.error("llm.generate failed", {
        requestId,
        provider,
        model,
        elapsedMs: elapsed,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  };

  const generateJSON = async <T = unknown>(
    prompt: string,
    overrides?: Omit<LLMGenerateOptions, "prompt" | "format">,
  ): Promise<T> => {
    const raw = await generate({ prompt, format: "json", ...overrides });

    // Strip any markdown fences (some providers still add these)
    let cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    // Strip <think>...</think> blocks (reasoning models like DeepSeek-R1)
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    // Handle unclosed think tags
    if (cleaned.startsWith("<think>")) {
      const jsonStart = cleaned.search(/[{\[]/);
      cleaned = jsonStart >= 0 ? cleaned.substring(jsonStart) : "";
    }

    if (!cleaned) {
      logger.warn("llm.generateJSON empty after cleanup", {
        rawPreview: raw.substring(0, 200),
      });
      throw new Error("LLM returned empty response after cleanup");
    }

    logger.debug("llm.generateJSON parsing", {
      preview: cleaned.substring(0, 200) + (cleaned.length > 200 ? "..." : ""),
    });

    try {
      return JSON.parse(cleaned) as T;
    } catch (error) {
      logger.error("llm.generateJSON parse failed", {
        error: error instanceof Error ? error.message : String(error),
        cleanedPreview: cleaned.substring(0, 500),
        rawPreview: raw.substring(0, 500),
      });
      throw new Error(
        `LLM returned unparseable JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  return {
    model,
    generate,
    generateJSON,
    probeHealth: async () => {
      if (monitor) await monitor.probe();
    },
    getHealthState: () => monitor?.getState(),
  };
};

/** Service contract exposed by the LLM client. */
export type LLMService = ReturnType<typeof createLLMService>;
