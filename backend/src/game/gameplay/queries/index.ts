import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import type { TurnLoader } from "@backend/game/state/load-turn-aggregate";
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
  loadGameAggregate: GameAggregateLoader;
  loadTurn: TurnLoader;
  getTurnsByRoundId: TurnsFinder<RoundId>;
  findPlayersByRoundId: PlayerFinderAll<PlayerRoundId>;
  db: DbContext;
}

export const createQueries = (logger: AppLogger) => (deps: QueriesDependencies) => {
  const getGameService = getGameStateService(
    logger.for({ service: "get-game" }).create(),
  )({
    loadGameAggregate: deps.loadGameAggregate,
  });
  const getGameController = getGameStateController({ getGameState: getGameService });

  const playersService = createGetPlayersService({ loadGameAggregate: deps.loadGameAggregate });
  const getPlayersController = createGetPlayersController(
    logger.for({ service: "get-players" }).create(),
  )({ getPlayersService: playersService });

  const eventsService = getEventsService(logger)({
    getEventsByGameId: gameEventsRepository.getEventsByGameId(deps.db),
    loadGameAggregate: deps.loadGameAggregate,
  });
  const eventsController = getEventsController({ getEvents: eventsService });

  const turnService = getTurnService({
    loadTurn: deps.loadTurn,
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
