import type { AIPlayerService } from "../ai-player.service";
import type { GameplayStateProvider } from "@backend/game/gameplay/state/gameplay-state.provider";
import type { DbContext } from "@backend/shared/data-access/transaction-handler";
import type { AppLogger } from "@backend/shared/logging";
import type { LLMService } from "../pipeline/llm.service";

import * as aiPipelineRunsRepository from "@backend/shared/data-access/repositories/ai-pipeline-runs.repository";
import * as gamesRepository from "@backend/shared/data-access/repositories/games.repository";

import { triggerMoveService } from "./trigger-move.service";
import { triggerMoveController } from "./trigger-move.controller";
import { getStatusService } from "./get-status.service";
import { getStatusController } from "./get-status.controller";

export interface AiMoveDependencies {
  aiPlayerService: AIPlayerService;
  getGameState: GameplayStateProvider;
  db: DbContext;
  llm: LLMService;
}

export const aiMove = (logger: AppLogger) => (deps: AiMoveDependencies) => {
  /** Trigger move */
  const triggerService = triggerMoveService(logger)({
    aiPlayerService: deps.aiPlayerService,
    getGameState: deps.getGameState,
  });
  const triggerController = triggerMoveController({ triggerMove: triggerService });

  /** Get status */
  const statusService = getStatusService({
    findRunningPipeline: aiPipelineRunsRepository.findRunningByGameId(deps.db),
    findGameByPublicId: gamesRepository.findGameByPublicId(deps.db),
    getGameState: deps.getGameState,
    llm: deps.llm,
  });
  const statusController = getStatusController({ getStatus: statusService });

  return {
    triggerMove: { controller: triggerController, service: triggerService },
    getStatus: { controller: statusController, service: statusService },
  };
};

export default aiMove;
