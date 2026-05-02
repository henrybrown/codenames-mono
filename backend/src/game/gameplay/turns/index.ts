import type { GameplayStateProvider } from "@backend/game/gameplay/state/gameplay-state.provider";
import type { GameplayHandler } from "../gameplay-actions";
import type { GameDataLoader } from "@backend/game/gameplay/state/game-data-loader";
import type { TurnStateProvider } from "@backend/game/gameplay/state/turn-state.provider";
import type { AppLogger } from "@backend/shared/logging";
import { createResolveGameplayContext } from "../shared/resolve-gameplay-context";

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
  getGameState: GameplayStateProvider;
  gameplayHandler: GameplayHandler;
  getTurnState: TurnStateProvider;
  loadGameData: GameDataLoader;
}

export const createTurns = (logger: AppLogger) => (deps: TurnsDependencies) => {
  const resolveContext = createResolveGameplayContext({
    getGameState: deps.getGameState,
    loadGameData: deps.loadGameData,
  });

  /** Give clue */
  const clueService = giveClueService(logger)({
    gameplayHandler: deps.gameplayHandler,
    getTurnState: deps.getTurnState,
  });
  const clueController = giveClueController(logger)({
    giveClue: clueService,
    resolveContext,
    loadGameData: deps.loadGameData,
  });

  /** Make guess */
  const guessService = createMakeGuessService(logger)({
    gameplayHandler: deps.gameplayHandler,
    getTurnState: deps.getTurnState,
  });
  const guessController = createMakeGuessController(logger)({
    makeGuess: guessService,
    resolveContext,
    loadGameData: deps.loadGameData,
  });

  /** End turn */
  const endService = createEndTurnService(logger)({
    gameplayHandler: deps.gameplayHandler,
  });
  const endController = createEndTurnController(logger)({
    endTurn: endService,
    resolveContext,
    loadGameData: deps.loadGameData,
  });

  /** Start turn */
  const startService = createStartTurnService(logger)({
    gameplayHandler: deps.gameplayHandler,
  });
  const startController = createStartTurnController(logger)({
    startTurn: startService,
    resolveContext,
    loadGameData: deps.loadGameData,
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
