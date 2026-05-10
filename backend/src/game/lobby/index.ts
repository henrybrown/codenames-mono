import { Express } from "express";
import { Kysely } from "kysely";
import { DB } from "@backend/shared/db/db.types";
import { Router } from "express";
import { AuthMiddleware } from "@backend/shared/http-middleware/auth.middleware";
import { blockingGameAction } from "@backend/game/access";
import type { AppLogger } from "@backend/shared/logging";
import { createTransactionalHandler } from "@backend/shared/data-access/transaction-handler";
import { createUser } from "@backend/shared/data-access/repositories/users.repository";

import { lobbyState } from "./state";
import { lobbyOperations } from "./lobby-actions";
import { createPlayers } from "./players";
import { createRounds } from "./rounds";
import { lobbyErrorHandler } from "./errors/lobby-errors.middleware";

import { startGameService } from "./start-game/start-game.service";
import { startGameController } from "./start-game/start-game.controller";

/** Setup imports (folded from top-level setup/) */
import { createGameService } from "./setup/create-game.service";
import { createGameController } from "./setup/create-game.controller";
import { setupOperations } from "./setup/setup-actions";
import { setupErrorHandler } from "./setup/errors/setup-errors.middleware";

/**
 * Initializes the lobby feature module with all routes and dependencies.
 * Also includes game creation (previously in setup/).
 */
export const initialize = (
  app: Express,
  db: Kysely<DB>,
  auth: AuthMiddleware,
  appLogger: AppLogger,
) => {
  const logger = appLogger.for({ feature: "lobby" }).create();
  /** State providers */
  const { provider: getLobbyState } = lobbyState(db);

  /** Transaction handlers */
  const lobbyHandler = createTransactionalHandler(db, lobbyOperations);
  const setupHandler = createTransactionalHandler(db, setupOperations);

  /** Players (add, modify, remove) */
  const players = createPlayers({ getLobbyState, lobbyHandler });

  /** Rounds (new-round, deal-cards, start-round) */
  const rounds = createRounds({ getLobbyState, lobbyHandler });

  /** Start game */
  const createUserRepo = createUser(db);
  const lobbyStartGameService = startGameService({
    lobbyHandler,
    getLobbyState,
    createUser: createUserRepo,
  });
  const lobbyStartGameController = startGameController({
    startGame: lobbyStartGameService,
  });

  /** Game creation (setup) */
  const setupGameService = createGameService({ setupHandler });
  const setupGameController = createGameController({ createGame: setupGameService });

  /** Routes */
  const router = Router();

  /** Setup route */
  router.post("/games", auth, setupGameController);

  /** Player routes */
  router.post("/games/:gameId/players", auth, blockingGameAction("add-players"), players.controllers.add);
  router.patch("/games/:gameId/players", auth, blockingGameAction("modify-players"), players.controllers.modify.batch);
  router.patch("/games/:gameId/players/:playerId", auth, blockingGameAction("modify-player"), players.controllers.modify.single);
  router.delete("/games/:gameId/players/:playerId", auth, blockingGameAction("remove-player"), players.controllers.remove);

  /** Game start */
  router.post("/games/:gameId/start", auth, blockingGameAction("start-game"), lobbyStartGameController);

  /** Round routes */
  router.post("/games/:gameId/rounds", auth, blockingGameAction("new-round"), rounds.controllers.newRound);
  router.post("/games/:gameId/rounds/:id/deal", auth, blockingGameAction("deal-cards"), rounds.controllers.dealCards);
  router.post("/games/:gameId/rounds/:roundNumber/start", auth, blockingGameAction("start-round"), rounds.controllers.startRound);

  app.use("/api", router);
  app.use("/api", lobbyErrorHandler(logger));
  app.use("/api", setupErrorHandler(logger));
};
