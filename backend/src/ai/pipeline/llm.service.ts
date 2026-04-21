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

export type LLMConfig = {
  provider: LLMProvider;
  baseURL: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
};

export type LLMGenerateOptions = {
  prompt: string;
  format?: "json";
  temperature?: number;
  maxTokens?: number;
};

/**
 * Creates a universal LLM service for AI gameplay decisions
 */
export const createLLMService = (config: LLMConfig, logger: AppLogger) => {
  const {
    provider,
    baseURL,
    apiKey,
    model,
    temperature = 0.7,
    maxTokens = 4096,
  } = config;

  const client = createProvider(provider, { apiKey, model, baseURL });

  let requestCount = 0;

  /**
   * Generate text/JSON from the LLM
   */
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

  /**
   * Generate and parse JSON response
   */
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
  };
};

/**
 * Type for the LLM service
 */
export type LLMService = ReturnType<typeof createLLMService>;
