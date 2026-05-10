import type { AIPlayerService } from "../player";
import type { GameAggregateLoader } from "@backend/game/gameplay/state/load-game-aggregate";
import type { DbContext } from "@backend/shared/data-access/transaction-handler";
import type { AppLogger } from "@backend/shared/logging";
import type { LLMService } from "../models";

import * as aiPipelineRunsRepository from "@backend/shared/data-access/repositories/ai-pipeline-runs.repository";

import { triggerMoveService } from "./trigger-move.service";
import { triggerMoveController } from "./trigger-move.controller";
import { getStatusService } from "./get-status.service";
import { getStatusController } from "./get-status.controller";

export interface AiMoveDependencies {
  aiPlayerService: AIPlayerService;
  loadGameAggregate: GameAggregateLoader;
  db: DbContext;
  llm: LLMService;
}

export const aiMove = (logger: AppLogger) => (deps: AiMoveDependencies) => {
  /** Trigger move */
  const triggerService = triggerMoveService(logger)({
    aiPlayerService: deps.aiPlayerService,
    loadGameAggregate: deps.loadGameAggregate,
  });
  const triggerController = triggerMoveController({ triggerMove: triggerService });

  /** Get status */
  const statusService = getStatusService({
    findRunningPipeline: aiPipelineRunsRepository.findRunningByGameId(deps.db),
    loadGameAggregate: deps.loadGameAggregate,
    llm: deps.llm,
  });
  const statusController = getStatusController({ getStatus: statusService });

  return {
    triggerMove: { controller: triggerController, service: triggerService },
    getStatus: { controller: statusController, service: statusService },
  };
};

export default aiMove;
