import type { GameplayHandler } from "../gameplay-actions";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type { TurnLoader } from "@backend/game/state/load-turn-aggregate";
import type { AppLogger } from "@backend/shared/logging";

import { giveClue } from "./clue";
import { makeGuess } from "./guess";
import { startTurn } from "./start";
import { endTurn } from "./end";

// todo: review turn action/service logic generally - should be much cleaner/ledgible

export interface TurnsDependencies {
  gameplayHandler: GameplayHandler;
  loadTurn: TurnLoader;
  loadGameAggregate: GameAggregateLoader;
}

export const createTurns = (logger: AppLogger) => (deps: TurnsDependencies) => {
  const clue = giveClue(logger)({
    gameplayHandler: deps.gameplayHandler,
    loadTurn: deps.loadTurn,
    loadGameAggregate: deps.loadGameAggregate,
  });

  const guess = makeGuess(logger)({
    gameplayHandler: deps.gameplayHandler,
    loadTurn: deps.loadTurn,
    loadGameAggregate: deps.loadGameAggregate,
  });

  const start = startTurn(logger)({
    gameplayHandler: deps.gameplayHandler,
    loadGameAggregate: deps.loadGameAggregate,
  });

  const end = endTurn(logger)({
    gameplayHandler: deps.gameplayHandler,
    loadGameAggregate: deps.loadGameAggregate,
  });

  return {
    controllers: {
      ...clue.controllers,
      ...guess.controllers,
      ...start.controllers,
      ...end.controllers,
    },
    services: {
      ...clue.services,
      ...guess.services,
      ...start.services,
      ...end.services,
    },
  };
};

export type { EndTurnService, EndTurnResult } from "./end";
export type { StartTurnService, StartTurnResult } from "./start";
