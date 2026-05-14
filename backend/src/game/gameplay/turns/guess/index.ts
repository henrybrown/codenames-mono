import type { TurnLoader } from "@backend/game/state/load-turn-aggregate";
import type { GameplayHandler } from "../../gameplay-actions";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type { AppLogger } from "@backend/shared/logging";
import type { TransactionContext } from "@backend/shared/data-access/transaction-handler";
import * as cardsRepository from "@backend/shared/data-access/repositories/cards.repository";
import * as turnsRepository from "@backend/shared/data-access/repositories/turns.repository";
import * as gameEventsRepository from "@backend/shared/data-access/repositories/game-events.repository";

import { makeGuessService } from "./make-guess.service";
import { makeGuessController } from "./make-guess.controller";
import { createMakeGuessAction } from "./make-guess.action";
import { validateMakeGuess } from "./make-guess.rules";

export interface MakeGuessDependencies {
  gameplayHandler: GameplayHandler;
  loadTurn: TurnLoader;
  loadGameAggregate: GameAggregateLoader;
}

export const makeGuess = (logger: AppLogger) => (dependencies: MakeGuessDependencies) => {
  const service = makeGuessService(logger)({
    gameplayHandler: dependencies.gameplayHandler,
    loadGameAggregate: dependencies.loadGameAggregate,
    loadTurn: dependencies.loadTurn,
  });

  const controller = makeGuessController(logger)({
    makeGuess: service,
  });

  return {
    controllers: { makeGuess: controller },
    services: { makeGuess: service },
  };
};

export default makeGuess;

/**
 * Binds the make-guess action to a transaction. Returns a function that
 * the gameplay ops registry can invoke.
 */
export const bindMakeGuessAction = (trx: TransactionContext) =>
  createMakeGuessAction({
    updateCards: cardsRepository.updateCards(trx),
    createGuess: turnsRepository.createGuess(trx),
    updateTurnGuesses: turnsRepository.updateTurnGuesses(trx),
    createEvent: gameEventsRepository.createEvent(trx),
    validateMakeGuess,
  });

export type BoundMakeGuessAction = ReturnType<typeof bindMakeGuessAction>;
