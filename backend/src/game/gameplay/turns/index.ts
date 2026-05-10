import type { GameplayHandler } from "../gameplay-actions";
import type { GameAggregateLoader } from "@backend/game/gameplay/state/load-game-aggregate";
import type { TurnStateProvider } from "@backend/game/gameplay/state/turn-state.provider";
import type { AppLogger } from "@backend/shared/logging";

import { giveClueService } from "./clue/give-clue.service";
import { giveClueController } from "./clue/give-clue.controller";
import { makeGuessService as createMakeGuessService } from "./guess/make-guess.service";
import { makeGuessController as createMakeGuessController } from "./guess/make-guess.controller";
import { createEndTurnService } from "./end-turn.service";
import { createEndTurnController } from "./end-turn.controller";
import { createStartTurnService } from "./start-turn.service";
import { createStartTurnController } from "./start-turn.controller";

// todo: review turn action/service logic generally - should be much cleaner/ledgible

export interface TurnsDependencies {
  gameplayHandler: GameplayHandler;
  getTurnState: TurnStateProvider;
  loadGameAggregate: GameAggregateLoader;
}

export const createTurns = (logger: AppLogger) => (deps: TurnsDependencies) => {
  /** Give clue */
  const clueService = giveClueService(logger)({
    gameplayHandler: deps.gameplayHandler,
    getTurnState: deps.getTurnState,
  });
  const clueController = giveClueController(logger)({
    giveClue: clueService,
    loadGameAggregate: deps.loadGameAggregate,
  });

  /** Make guess */
  const guessService = createMakeGuessService(logger)({
    gameplayHandler: deps.gameplayHandler,
    getTurnState: deps.getTurnState,
  });
  const guessController = createMakeGuessController(logger)({
    makeGuess: guessService,
    loadGameAggregate: deps.loadGameAggregate,
  });

  /** End turn */
  const endService = createEndTurnService(logger)({
    gameplayHandler: deps.gameplayHandler,
  });
  const endController = createEndTurnController(logger)({
    endTurn: endService,
    loadGameAggregate: deps.loadGameAggregate,
  });

  /** Start turn */
  const startService = createStartTurnService(logger)({
    gameplayHandler: deps.gameplayHandler,
  });
  const startController = createStartTurnController(logger)({
    startTurn: startService,
    loadGameAggregate: deps.loadGameAggregate,
  });

  return {
    controllers: {
      giveClue: clueController,
      makeGuess: guessController,
      endTurn: endController,
      startTurn: startController,
    },
    services: {
      giveClue: clueService,
      makeGuess: guessService,
      endTurn: endService,
      startTurn: startService,
    },
  };
};

export type { EndTurnService, EndTurnResult } from "./end-turn.service";
export type { StartTurnService, StartTurnResult } from "./start-turn.service";
