import type { AIPlayerService } from "../player";
import type { GameplayStateProvider } from "@backend/game/gameplay/state/get-gameplay-state";
import type { DbContext } from "@backend/shared/data-access/transaction-handler";
import type { AppLogger } from "@backend/shared/logging";
import type { LLMService } from "../models";

import * as aiPipelineRunsRepository from "@backend/shared/data-access/repositories/ai-pipeline-runs.repository";
import * as gamesRepository from "@backend/shared/data-access/repositories/games.repository";

import { triggerMoveService } from "./trigger-move.service";
import { triggerMoveController } from "./trigger-move.controller";
import { getStatusService } from "./get-status.service";
import { getStatusController } from "./get-status.controller";

export interface AiMoveDependencies {
  aiPlayerService: AIPlayerService;
  getGameplayState: GameplayStateProvider;
  db: DbContext;
  llm: LLMService;
}

export const aiMove = (logger: AppLogger) => (deps: AiMoveDependencies) => {
  /** Trigger move */
  const triggerService = triggerMoveService(logger)({
    aiPlayerService: deps.aiPlayerService,
    getGameplayState: deps.getGameplayState,
  });
  const triggerController = triggerMoveController({ triggerMove: triggerService });

  /** Get status */
  const statusService = getStatusService({
    findRunningPipeline: aiPipelineRunsRepository.findRunningByGameId(deps.db),
    findGameByPublicId: gamesRepository.findGameByPublicId(deps.db),
    getGameplayState: deps.getGameplayState,
    llm: deps.llm,
  });
  const statusController = getStatusController({ getStatus: statusService });

  return {
    triggerMove: { controller: triggerController, service: triggerService },
    getStatus: { controller: statusController, service: statusService },
  };
};

export default aiMove;
