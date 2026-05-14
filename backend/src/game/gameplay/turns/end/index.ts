import type { GameplayHandler } from "../../gameplay-actions";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type { AppLogger } from "@backend/shared/logging";
import type { TransactionContext } from "@backend/shared/data-access/transaction-handler";
import * as turnsRepository from "@backend/shared/data-access/repositories/turns.repository";

import { createEndTurnService } from "./end-turn.service";
import { createEndTurnController } from "./end-turn.controller";
import { createEndTurnAction } from "./end-turn.action";
import { validateEndTurn } from "./end-turn.rules";

export interface EndTurnDependencies {
  gameplayHandler: GameplayHandler;
  loadGameAggregate: GameAggregateLoader;
}

export const endTurn = (logger: AppLogger) => (deps: EndTurnDependencies) => {
  const service = createEndTurnService(logger)({
    gameplayHandler: deps.gameplayHandler,
    loadGameAggregate: deps.loadGameAggregate,
  });
  const controller = createEndTurnController(logger)({
    endTurn: service,
  });
  return {
    controllers: { endTurn: controller },
    services: { endTurn: service },
  };
};

export type {
  EndTurnService,
  EndTurnResult,
} from "./end-turn.service";

export {
  createEndTurnAction,
  type EndTurnAction,
  type EndTurnActionResult,
} from "./end-turn.action";

export {
  validateEndTurn,
  type EndTurnValidGameState,
} from "./end-turn.rules";

/**
 * Binds the end-turn action to a transaction. Returns a function that
 * the gameplay ops registry can invoke.
 */
export const bindEndTurnAction = (trx: TransactionContext) =>
  createEndTurnAction({
    updateTurnStatus: turnsRepository.updateTurnStatus(trx),
    validateEndTurn,
  });

export type BoundEndTurnAction = ReturnType<typeof bindEndTurnAction>;
