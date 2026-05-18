import type { AIPlayerService } from "../player";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type { DbContext } from "@backend/shared/data-access/transaction-handler";
import type { AppLogger } from "@backend/shared/logging";
import type { LLMService } from "../models";

import * as aiPipelineRunsRepository from "@backend/shared/data-access/repositories/ai-pipeline-runs.repository";

import { triggerMoveService } from "./trigger-move.service";
import { triggerMoveController } from "./trigger-move.controller";
import { getStatusService } from "./get-status.service";
import { getStatusController } from "./get-status.controller";

/** Wiring dependencies for the AI move sub-feature. */
export interface AiMoveDependencies {
  aiPlayerService: AIPlayerService;
  loadGameAggregate: GameAggregateLoader;
  db: DbContext;
  llm: LLMService;
}

/**
 * Builds the AI move sub-feature — controllers + services for triggering
 * a move and polling its status.
 *
 * Returns `{ controllers, services }` for the parent module to mount on
 * its router and wire into cross-feature surfaces.
 */
export const aiMove = (logger: AppLogger) => (deps: AiMoveDependencies) => {
  const triggerService = triggerMoveService(logger)({
    aiPlayerService: deps.aiPlayerService,
    loadGameAggregate: deps.loadGameAggregate,
  });
  const triggerController = triggerMoveController({ triggerMove: triggerService });

  const statusService = getStatusService({
    findRunningPipeline: aiPipelineRunsRepository.findRunningByGameId(deps.db),
    loadGameAggregate: deps.loadGameAggregate,
    llm: deps.llm,
  });
  const statusController = getStatusController({ getStatus: statusService });

  return {
    controllers: {
      triggerMove: triggerController,
      getStatus: statusController,
    },
    services: {
      triggerMove: triggerService,
      getStatus: statusService,
    },
  };
};

export default aiMove;
