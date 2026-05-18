import { Express } from "express";
import { Kysely } from "kysely";
import { DB } from "@backend/shared/db/db.types";
import { Router } from "express";
import { AuthMiddleware } from "@backend/shared/http-middleware/auth.middleware";
import { blockingGameAction } from "@backend/game/access";
import type { AppLogger } from "@backend/shared/logging";
import { createTransactionalHandler } from "@backend/shared/data-access/transaction-handler";
import { createUser } from "@backend/shared/data-access/repositories/users.repository";

import { createLobbyAggregateLoader } from "./state";
import { lobbyOperations } from "./lobby-actions";
import { createPlayers } from "./players";
import { createRounds } from "./rounds";
import { lobbyErrorHandler } from "./errors/lobby-errors.middleware";

import { startGameService } from "./start-game/start-game.service";
import { startGameController } from "./start-game/start-game.controller";

import { createGameService } from "./setup/create-game.service";
import { createGameController } from "./setup/create-game.controller";
import { setupOperations } from "./setup/setup-actions";
import { setupErrorHandler } from "./setup/errors/setup-errors.middleware";

/**
 * Initializes the lobby feature — game creation, player management,
 * round setup, and game start.
 *
 * Mounts the lobby and setup routers under `/api`, plus their respective
 * error handlers. Each mutating endpoint is wrapped in
 * `blockingGameAction` to serialize concurrent writes per game.
 */
export const initialize = (
  app: Express,
  db: Kysely<DB>,
  auth: AuthMiddleware,
  appLogger: AppLogger,
) => {
  const logger = appLogger.for({ feature: "lobby" }).create();
  const loadLobbyAggregate = createLobbyAggregateLoader(db);

  const lobbyHandler = createTransactionalHandler(db, lobbyOperations);
  const setupHandler = createTransactionalHandler(db, setupOperations);

  const players = createPlayers({ loadLobbyAggregate, lobbyHandler });

  const rounds = createRounds({ loadLobbyAggregate, lobbyHandler });

  const createUserRepo = createUser(db);
  const lobbyStartGameService = startGameService({
    lobbyHandler,
    loadLobbyAggregate,
    createUser: createUserRepo,
  });
  const lobbyStartGameController = startGameController({
    startGame: lobbyStartGameService,
  });

  const setupGameService = createGameService({ setupHandler });
  const setupGameController = createGameController({ createGame: setupGameService });

  const router = Router();

  router.post("/games", auth, setupGameController);

  router.post("/games/:gameId/players", auth, blockingGameAction("add-players"), players.controllers.add);
  router.patch("/games/:gameId/players", auth, blockingGameAction("modify-players"), players.controllers.modifyBatch);
  router.patch("/games/:gameId/players/:playerId", auth, blockingGameAction("modify-player"), players.controllers.modifySingle);
  router.delete("/games/:gameId/players/:playerId", auth, blockingGameAction("remove-player"), players.controllers.remove);

  router.post("/games/:gameId/start", auth, blockingGameAction("start-game"), lobbyStartGameController);

  router.post("/games/:gameId/rounds", auth, blockingGameAction("new-round"), rounds.controllers.newRound);
  router.post("/games/:gameId/rounds/:id/deal", auth, blockingGameAction("deal-cards"), rounds.controllers.dealCards);
  router.post("/games/:gameId/rounds/:roundNumber/start", auth, blockingGameAction("start-round"), rounds.controllers.startRound);

  app.use("/api", router);
  app.use("/api", lobbyErrorHandler(logger));
  app.use("/api", setupErrorHandler(logger));
};
