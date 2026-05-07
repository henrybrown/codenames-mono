/**
 * AI Module - Initializes AI-related services following the repository pattern
 * todo: clean whole feature....
 */

import type { Express } from "express";
import { Router } from "express";
import type { Kysely } from "kysely";
import type { DB } from "@backend/shared/db/db.types";
import type { AuthMiddleware } from "@backend/shared/http-middleware/auth.middleware";
import type { HttpLoggerHandler } from "@backend/shared/http-middleware/http-logger.middleware";
import { blockingGameAction } from "@backend/shared/http-middleware/blocking-game-action.middleware";
import type { AppLogger } from "@backend/shared/logging";
import { createModels } from "./models";
import type { LLMService, LLMProvider } from "./models";
import { createAIPlayerService } from "./ai-player.service";
import type { AIPlayerService } from "./ai-player.service";
import type { GiveClueService } from "@backend/game/gameplay/turns/clue/give-clue.service";
import type { MakeGuessService } from "@backend/game/gameplay/turns/guess/make-guess.service";
import type { EndTurnService } from "@backend/game/gameplay/turns/end-turn.service";
import type { GameplayStateProvider } from "@backend/game/gameplay/state/gameplay-state.provider";
import type { GameDataLoader } from "@backend/game/gameplay/state/game-data-loader";
import {
  createRun,
  findRunningByGameId,
  updateRunStatus,
  updateSpymasterResponse,
  updatePrefilterResponse,
  updateRankerResponse,
  appendPrompt,
} from "@backend/shared/data-access/repositories/ai-pipeline-runs.repository";
import { createMessage } from "@backend/shared/data-access/repositories/game-messages.repository";
import { findGameByPublicId } from "@backend/shared/data-access/repositories/games.repository";
import aiMove from "./move";

export { createPipeline } from "./pipeline";
export type { CodenamesPipeline } from "./pipeline";
export type { LLMService, AIPlayerService };

export type AIModuleDependencies = {
  app: Express;
  db: Kysely<DB>;
  auth: AuthMiddleware;
  httpLogger: HttpLoggerHandler;
  appLogger: AppLogger;
  llmConfig: {
    provider: LLMProvider;
    baseURL: string;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    healthCheck?: {
      enabled: boolean;
      throttleMs: number;
      gpuThreshold: number;
    };
  };
  giveClue: GiveClueService;
  makeGuess: MakeGuessService;
  endTurn: EndTurnService;
  getGameState: GameplayStateProvider;
  loadGameData: GameDataLoader;
};

/**
 * Initializes the AI feature module with all dependencies and registers routes
 */
export const initialize = (dependencies: AIModuleDependencies) => {
  const {
    app,
    db,
    auth,
    httpLogger,
    appLogger,
    llmConfig,
    giveClue,
    makeGuess,
    endTurn,
    getGameState,
    loadGameData,
  } = dependencies;

  const logger = appLogger.for({ feature: "ai" }).withMeta({ model: llmConfig.model }).create();
  const { llm } = createModels(logger)({ config: llmConfig });

  const aiPlayerService = createAIPlayerService(logger)({
    llm,
    giveClue,
    makeGuess,
    endTurn,
    loadGameData,
    createPipelineRun: createRun(db),
    findRunningPipeline: findRunningByGameId(db),
    updatePipelineStatus: updateRunStatus(db),
    updateSpymasterResponse: updateSpymasterResponse(db),
    updatePrefilterResponse: updatePrefilterResponse(db),
    updateRankerResponse: updateRankerResponse(db),
    appendPrompt: appendPrompt(db),
    createGameMessage: createMessage(db),
    findGameByPublicId: findGameByPublicId(db),
  });

  aiPlayerService.initialize();

  const aiMoveFeature = aiMove(logger)({
    aiPlayerService,
    getGameState,
    db,
    llm,
  });

  const router = Router();

  // HTTP request/response logging
  router.use(httpLogger(logger));

  router.post("/games/:gameId/ai/move", auth, blockingGameAction("ai-move"), aiMoveFeature.triggerMove.controller);
  router.get("/games/:gameId/ai/status", auth, aiMoveFeature.getStatus.controller);

  app.use("/api", router);

  logger.info("AI module initialized");

  return {
    aiPlayerService,
    llm,
  };
};
