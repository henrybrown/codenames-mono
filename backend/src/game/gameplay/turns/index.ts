import type { GameplayHandler } from "../gameplay-actions";
import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type { TurnLoader } from "@backend/game/state/load-turn-aggregate";
import type { AppLogger } from "@backend/shared/logging";

import { giveClue } from "./clue";
import { makeGuess } from "./guess";
import { createEndTurnService } from "./end-turn.service";
import { createEndTurnController } from "./end-turn.controller";
import { createStartTurnService } from "./start-turn.service";
import { createStartTurnController } from "./start-turn.controller";

// todo: review turn action/service logic generally - should be much cleaner/ledgible

export interface TurnsDependencies {
  gameplayHandler: GameplayHandler;
  loadTurn: TurnLoader;
  loadGameAggregate: GameAggregateLoader;
}

export const createTurns = (logger: AppLogger) => (deps: TurnsDependencies) => {
  /** Give clue (sub-feature) */
  const clue = giveClue(logger)({
    gameplayHandler: deps.gameplayHandler,
    loadTurn: deps.loadTurn,
    loadGameAggregate: deps.loadGameAggregate,
  });

  /** Make guess (sub-feature) */
  const guess = makeGuess(logger)({
    gameplayHandler: deps.gameplayHandler,
    loadTurn: deps.loadTurn,
    loadGameAggregate: deps.loadGameAggregate,
  });

  /** End turn (inline — no sub-feature folder yet) */
  const endService = createEndTurnService(logger)({
    gameplayHandler: deps.gameplayHandler,
  });
  const endController = createEndTurnController(logger)({
    endTurn: endService,
    loadGameAggregate: deps.loadGameAggregate,
  });

  /** Start turn (inline — no sub-feature folder yet) */
  const startService = createStartTurnService(logger)({
    gameplayHandler: deps.gameplayHandler,
  });
  const startController = createStartTurnController(logger)({
    startTurn: startService,
    loadGameAggregate: deps.loadGameAggregate,
  });

  return {
    controllers: {
      ...clue.controllers,
      ...guess.controllers,
      endTurn: endController,
      startTurn: startController,
    },
    services: {
      ...clue.services,
      ...guess.services,
      endTurn: endService,
      startTurn: startService,
    },
  };
};

export type { EndTurnService, EndTurnResult } from "./end-turn.service";
export type { StartTurnService, StartTurnResult } from "./start-turn.service";
