/**
 * Pipeline — domain layer for the AI feature
 *
 * Orchestrates spymaster + guesser roles over an opaque LLM service.
 * Knows nothing about which provider is behind the LLM.
 */

import type { AppLogger } from "@backend/shared/logging";
import type { LLMService } from "../models";
import { createCodenamesPipeline } from "./codenames-pipeline";
import type { CodenamesPipeline } from "./codenames-pipeline";

export type { CodenamesPipeline } from "./codenames-pipeline";
export type {
  SpymasterInput,
  SpymasterOutput,
  GuesserInput,
  GuesserDecision,
  RankingInput,
  RankedWord,
  RankingOutput,
  PreFilterInput,
  PreFilterOutput,
} from "./codenames-pipeline";

export interface PipelineDependencies {
  llm: LLMService;
}

export const createPipeline =
  (logger: AppLogger) =>
  (deps: PipelineDependencies): CodenamesPipeline =>
    createCodenamesPipeline(deps.llm, logger);
