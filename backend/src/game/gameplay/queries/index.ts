import type { GameplayStateProvider } from "@backend/game/gameplay/state/gameplay-state.provider";
import type { GameplayStateProvider as NewGameplayStateProvider } from "@backend/game/gameplay/state/get-gameplay-state";
import type { GameDataLoader } from "@backend/game/gameplay/state/load-game-aggregate";
import type { TurnStateProvider } from "@backend/game/gameplay/state/turn-state.provider";
import type { TurnsFinder, RoundId } from "@backend/shared/data-access/repositories/turns.repository";
import type { PlayerFinderAll, RoundId as PlayerRoundId } from "@backend/shared/data-access/repositories/players.repository";
import type { DbContext } from "@backend/shared/data-access/transaction-handler";
import type { AppLogger } from "@backend/shared/logging";

import * as gameEventsRepository from "@backend/shared/data-access/repositories/game-events.repository";

import { getGameStateService } from "./get-game.service";
import { getGameStateController } from "./get-game.controller";
import { createGetPlayersService } from "./get-players.service";
import { createGetPlayersController } from "./get-players.controller";
import { getEventsService } from "./get-events.service";
import { getEventsController } from "./get-events.controller";
import { getTurnService } from "./get-turn.service";
import { controller as getTurnControllerFactory } from "./get-turn.controller";

export interface QueriesDependencies {
  getGameState: GameplayStateProvider;          // legacy — used by get-events / get-players
  getGameplayState: NewGameplayStateProvider;   // new — used by get-game
  loadGameData: GameDataLoader;
  getTurnState: TurnStateProvider;
  getTurnsByRoundId: TurnsFinder<RoundId>;
  findPlayersByRoundId: PlayerFinderAll<PlayerRoundId>;
  db: DbContext;
}

export const createQueries = (logger: AppLogger) => (deps: QueriesDependencies) => {
  /** Get game */
  const getGameService = getGameStateService(
    logger.for({ service: "get-game" }).create(),
  )({
    getGameplayState: deps.getGameplayState,
  });
  const getGameController = getGameStateController({ getGameState: getGameService });

  /** Get players */
  const playersService = createGetPlayersService({ getGameplayState: deps.getGameplayState });
  const getPlayersController = createGetPlayersController(
    logger.for({ service: "get-players" }).create(),
  )({ getPlayersService: playersService });

  /** Get events */
  const eventsService = getEventsService(logger)({
    getEventsByGameId: gameEventsRepository.getEventsByGameId(deps.db),
    getGameplayState: deps.getGameplayState,
  });
  const eventsController = getEventsController({ getEvents: eventsService });

  /** Get turn */
  const turnService = getTurnService({
    getTurnState: deps.getTurnState,
    getTurnsByRoundId: deps.getTurnsByRoundId,
    findPlayersByRoundId: deps.findPlayersByRoundId,
  });
  const getTurnController = getTurnControllerFactory(
    logger.for({ service: "get-turn" }).create(),
  )(turnService);

  return {
    controllers: {
      getGame: getGameController,
      getPlayers: getPlayersController,
      getEvents: eventsController,
      getTurn: getTurnController,
    },
  };
};
