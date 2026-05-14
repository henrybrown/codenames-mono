/**
 * AI Module
 *
 * Composes the AI feature from four sub-features:
 *   - models/    Infra: builds the LLM client from config (provider-agnostic boundary)
 *   - pipeline/  Domain: spymaster + guesser orchestration over an opaque LLM
 *   - player/    Event-driven decision loop for AI players
 *   - move/      HTTP routes for triggering a move + checking status
 *
 * This file is the single place that touches `db` — repositories are bound
 * here once and passed down to sub-features as typed function dependencies.
 */

import type { Express } from "express";
import { Router } from "express";
import type { Kysely } from "kysely";
import type { DB } from "@backend/shared/db/db.types";
import type { HttpClient } from "@backend/shared/http-client";
import type { AuthMiddleware } from "@backend/shared/http-middleware/auth.middleware";
import type { HttpLoggerHandler } from "@backend/shared/http-middleware/http-logger.middleware";
import { blockingGameAction } from "@backend/game/access";
import type { AppLogger } from "@backend/shared/logging";

import * as aiPipelineRunsRepo from "@backend/shared/data-access/repositories/ai-pipeline-runs.repository";
import * as gameMessagesRepo from "@backend/shared/data-access/repositories/game-messages.repository";
import * as gamesRepo from "@backend/shared/data-access/repositories/games.repository";

import { createModels } from "./models";
import type { LLMConfig, LLMService, LLMProvider } from "./models";
import { createPipeline, type PromptStyle } from "./pipeline";
import { createPlayer } from "./player";
import aiMove from "./move";

import type { GiveClueService } from "@backend/game/gameplay/turns/clue/give-clue.service";
import type { MakeGuessService } from "@backend/game/gameplay/turns/guess/make-guess.service";
import type { EndTurnService } from "@backend/game/gameplay/turns/end";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";

export { createPipeline } from "./pipeline";
export type { CodenamesPipeline } from "./pipeline";
export type { LLMService, LLMProvider } from "./models";
export type { AIPlayerService } from "./player";

/**
 * The slice of the gameplay feature that AI consumes.
 *
 * Defined here (rather than in `game/gameplay/`) so the cross-feature
 * contract is owned by AI: gameplay can grow new exports without
 * widening AI's contract, and renames in gameplay produce type errors
 * exactly at the AI boundary.
 */
export type GameplayFeature = {
  services: {
    giveClue: GiveClueService;
    makeGuess: MakeGuessService;
    endTurn: EndTurnService;
  };
  state: {
    loadGameAggregate: GameAggregateLoader;
  };
};

export type AIModuleDependencies = {
  app: Express;
  db: Kysely<DB>;
  httpClient: HttpClient;
  auth: AuthMiddleware;
  httpLogger: HttpLoggerHandler;
  appLogger: AppLogger;
  llmConfig: LLMConfig;
  gameplay: GameplayFeature;
};

export const initialize = (deps: AIModuleDependencies) => {
  const { app, db, httpClient, auth, httpLogger, appLogger, llmConfig, gameplay } = deps;

  const logger = appLogger
    .for({ feature: "ai" })
    .withMeta({ model: llmConfig.model })
    .create();

  const repositories = {
    createPipelineRun:       aiPipelineRunsRepo.createRun(db),
    findRunningPipeline:     aiPipelineRunsRepo.findRunningByGameId(db),
    updatePipelineStatus:    aiPipelineRunsRepo.updateRunStatus(db),
    updateSpymasterResponse: aiPipelineRunsRepo.updateSpymasterResponse(db),
    updatePrefilterResponse: aiPipelineRunsRepo.updatePrefilterResponse(db),
    updateRankerResponse:    aiPipelineRunsRepo.updateRankerResponse(db),
    appendPrompt:            aiPipelineRunsRepo.appendPrompt(db),
    createGameMessage:       gameMessagesRepo.createMessage(db),
    findGameByPublicId:      gamesRepo.findGameByPublicId(db),
  };

  const { llm } = createModels(logger)({ config: llmConfig, httpClient });

  const promptStyle: PromptStyle = llmConfig.providerName === "ollama" ? "local" : "hosted";
  const pipeline = createPipeline(logger)({ llm, promptStyle });

  const player = createPlayer(logger)({
    pipeline,
    giveClue:          gameplay.services.giveClue,
    makeGuess:         gameplay.services.makeGuess,
    endTurn:           gameplay.services.endTurn,
    loadGameAggregate: gameplay.state.loadGameAggregate,
    createPipelineRun:       repositories.createPipelineRun,
    findRunningPipeline:     repositories.findRunningPipeline,
    updatePipelineStatus:    repositories.updatePipelineStatus,
    updateSpymasterResponse: repositories.updateSpymasterResponse,
    updatePrefilterResponse: repositories.updatePrefilterResponse,
    updateRankerResponse:    repositories.updateRankerResponse,
    appendPrompt:            repositories.appendPrompt,
    createGameMessage:       repositories.createGameMessage,
    findGameByPublicId:      repositories.findGameByPublicId,
  });

  player.initialize();

  const aiMoveFeature = aiMove(logger)({
    aiPlayerService: player,
    loadGameAggregate: gameplay.state.loadGameAggregate,
    db,   // move/ still takes db internally — separate clean-up pass
    llm,  // move/get-status reads health off llm — separate clean-up pass
  });

  const router = Router();
  router.use(httpLogger(logger));
  router.post(
    "/games/:gameId/ai/move",
    auth,
    blockingGameAction("ai-move"),
    aiMoveFeature.controllers.triggerMove,
  );
  router.get("/games/:gameId/ai/status", auth, aiMoveFeature.controllers.getStatus);

  app.use("/api", router);

  logger.info("AI module initialized");

  return {
    services: { aiPlayer: player },
    state: { llm },
  };
};
