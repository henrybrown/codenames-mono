/**
 * Pipeline — domain layer for the AI feature
 *
 * Orchestrates spymaster + guesser roles over an opaque LLM service.
 * Knows nothing about which provider is behind the LLM, except that
 * it accepts a promptStyle hint so role prompts can be tuned to model class.
 */

import type { AppLogger } from "@backend/shared/logging";
import type { LLMService } from "../models";
import { createCodenamesPipeline } from "./codenames-pipeline";
import type { CodenamesPipeline } from "./codenames-pipeline";
import type { PromptStyle } from "./prompts";

export type {
  CodenamesPipeline,
  SpymasterInput,
  SpymasterOutput,
  GuesserInput,
  GuesserOutput,
  RankingInput,
  RankedWord,
} from "./codenames-pipeline";
export type { PromptStyle } from "./prompts";

export interface PipelineDependencies {
  llm: LLMService;
  promptStyle: PromptStyle;
}

export const createPipeline =
  (logger: AppLogger) =>
  (deps: PipelineDependencies): CodenamesPipeline =>
    createCodenamesPipeline(deps.llm, deps.promptStyle, logger);
