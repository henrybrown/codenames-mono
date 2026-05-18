import type { GameplayHandler } from "../../gameplay-actions";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type { AppLogger } from "@backend/shared/logging";
import type { TransactionContext } from "@backend/shared/data-access/transaction-handler";
import * as turnsRepository from "@backend/shared/data-access/repositories/turns.repository";

import { createStartTurnService } from "./start-turn.service";
import { createStartTurnController } from "./start-turn.controller";
import { createStartTurnAction } from "./start-turn.action";
import { validateStartTurn } from "./start-turn.rules";

/** Wiring dependencies for the start-turn sub-feature. */
export interface StartTurnDependencies {
  gameplayHandler: GameplayHandler;
  loadGameAggregate: GameAggregateLoader;
}

/** Builds the start-turn sub-feature (controller + service). */
export const startTurn = (logger: AppLogger) => (deps: StartTurnDependencies) => {
  const service = createStartTurnService(logger)({
    gameplayHandler: deps.gameplayHandler,
    loadGameAggregate: deps.loadGameAggregate,
  });
  const controller = createStartTurnController(logger)({
    startTurn: service,
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
 * Binds the start-turn action against a transaction-scoped repository
 * and validator. Returns the action closed over the transaction.
 */
export const bindStartTurnAction = (trx: TransactionContext) =>
  createStartTurnAction({
    createTurn: turnsRepository.createTurn(trx),
    validateStartTurn,
  });

/** Transaction-bound start-turn action. */
export type BoundStartTurnAction = ReturnType<typeof bindStartTurnAction>;
