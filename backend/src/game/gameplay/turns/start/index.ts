import type { GameplayHandler } from "../../gameplay-actions";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type { AppLogger } from "@backend/shared/logging";
import type { TransactionContext } from "@backend/shared/data-access/transaction-handler";
import * as turnsRepository from "@backend/shared/data-access/repositories/turns.repository";

import { createStartTurnService } from "./start-turn.service";
import { createStartTurnController } from "./start-turn.controller";
import { createStartTurnAction } from "./start-turn.action";
import { validateStartTurn } from "./start-turn.rules";

export interface StartTurnDependencies {
  gameplayHandler: GameplayHandler;
  loadGameAggregate: GameAggregateLoader;
}

export const startTurn = (logger: AppLogger) => (deps: StartTurnDependencies) => {
  const service = createStartTurnService(logger)({
    gameplayHandler: deps.gameplayHandler,
  });
  const controller = createStartTurnController(logger)({
    startTurn: service,
    loadGameAggregate: deps.loadGameAggregate,
  });
  return {
    controllers: { startTurn: controller },
    services: { startTurn: service },
  };
};

export type {
  StartTurnService,
  StartTurnResult,
} from "./start-turn.service";

export {
  createStartTurnAction,
  type StartTurnAction,
  type StartTurnActionResult,
} from "./start-turn.action";

export {
  validateStartTurn,
  type StartTurnValidGameState,
} from "./start-turn.rules";

/**
 * Binds the start-turn action to a transaction. Returns a function that
 * the gameplay ops registry can invoke.
 */
export const bindStartTurnAction = (trx: TransactionContext) =>
  createStartTurnAction({
    createTurn: turnsRepository.createTurn(trx),
    validateStartTurn,
  });

export type BoundStartTurnAction = ReturnType<typeof bindStartTurnAction>;
