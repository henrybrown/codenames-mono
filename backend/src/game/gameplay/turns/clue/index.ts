import type { TurnLoader } from "@backend/game/state/load-turn-aggregate";
import type { GameplayHandler } from "../../gameplay-actions";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type { AppLogger } from "@backend/shared/logging";
import type { TransactionContext } from "@backend/shared/data-access/transaction-handler";
import * as turnsRepository from "@backend/shared/data-access/repositories/turns.repository";

import { giveClueService } from "./give-clue.service";
import { giveClueController } from "./give-clue.controller";
import { giveClueToTurn } from "./give-clue.action";
import { validate as validateGiveClue, validateClueWord } from "./give-clue.rules";

/** Wiring dependencies for the give-clue sub-feature. */
export interface GiveClueDependencies {
  gameplayHandler: GameplayHandler;
  loadTurn: TurnLoader;
  loadGameAggregate: GameAggregateLoader;
}

/**
 * Builds the give-clue sub-feature (controller + service).
 *
 * Returns `{ controllers, services }` for the parent module to mount and
 * expose.
 */
export const giveClue = (logger: AppLogger) => (dependencies: GiveClueDependencies) => {
  const service = giveClueService(logger)({
    gameplayHandler: dependencies.gameplayHandler,
    loadGameAggregate: dependencies.loadGameAggregate,
    loadTurn: dependencies.loadTurn,
  });

  const controller = giveClueController(logger)({
    giveClue: service,
  });

  return {
    controllers: { giveClue: controller },
    services: { giveClue: service },
  };
};

export default giveClue;

/**
 * Binds the give-clue action against a transaction-scoped set of
 * repositories and validators.
 *
 * The caller passes in only the transaction; everything else is closed
 * over and ready to be invoked by the ops registry.
 */
export const bindGiveClueAction = (trx: TransactionContext) =>
  giveClueToTurn(
    turnsRepository.createClue(trx),
    turnsRepository.updateTurnGuesses(trx),
    validateGiveClue,
    validateClueWord,
  );

/** Transaction-bound give-clue action. */
export type BoundGiveClueAction = ReturnType<typeof bindGiveClueAction>;
