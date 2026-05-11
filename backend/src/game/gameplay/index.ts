import { Express } from "express";
import { Kysely } from "kysely";
import { DB } from "@backend/shared/db/db.types";
import { Router } from "express";
import { AuthMiddleware } from "@backend/shared/http-middleware/auth.middleware";
import type { HttpLoggerHandler } from "@backend/shared/http-middleware/http-logger.middleware";
import { blockingGameAction, requireGameRole } from "@backend/game/access";
import * as gamesRepo from "@backend/shared/data-access/repositories/games.repository";
import * as playersRepo from "@backend/shared/data-access/repositories/players.repository";
import type { AppLogger } from "@backend/shared/logging";
import { PLAYER_ROLE } from "@codenames/shared/types";

import { gameplayState, turnState } from "@backend/game/state";
import { gameplayActions } from "./gameplay-actions";
import { createQueries } from "./queries";
import { createTurns } from "./turns";
import { gameplayErrorHandler } from "./errors/gameplay-errors.middleware";

/**
 * Initializes the gameplay feature module with all routes and dependencies
 */
export const initialize = (
  app: Express,
  db: Kysely<DB>,
  auth: AuthMiddleware,
  httpLogger: HttpLoggerHandler,
  appLogger: AppLogger,
) => {
  const logger = appLogger.for({ feature: "gameplay" }).create();

  /** State providers */
  const { loadGameAggregate } = gameplayState(db);
  const { provider: getTurnState, getTurnsByRoundId, findPlayersByRoundId } = turnState(db);

  /** Gameplay actions (transactional handler) */
  const { handler: gameplayHandler } = gameplayActions(db);

  /** Access (RBAC) — partial-applied with deps */
  const gameRole = requireGameRole({
    getGameByPublicId: gamesRepo.findGameByPublicId(db),
    getPlayerByGameAndUser: playersRepo.findPlayerByGameAndUser(db),
  });

  /** Queries */
  const queries = createQueries(logger)({
    loadGameAggregate,
    getTurnState,
    getTurnsByRoundId,
    findPlayersByRoundId,
    db,
  });

  /** Turns (clue, guess, end-turn, start-turn) */
  const turns = createTurns(logger)({
    gameplayHandler,
    getTurnState,
    loadGameAggregate,
  });

  /** Routes */
  const router = Router();
  router.use(httpLogger(logger));
  router.use(auth);

  // Reads — no role gate. Controllers handle spectator filtering.
  router.get("/games/:gameId", queries.controllers.getGame);
  router.get("/games/:gameId/players", queries.controllers.getPlayers);
  router.get("/games/:gameId/events", queries.controllers.getEvents);
  router.get("/turns/:turnId", queries.controllers.getTurn);

  // Writes — RBAC gate.
  router.post(
    "/games/:gameId/rounds/:roundNumber/clues",
    gameRole(PLAYER_ROLE.CODEMASTER),
    blockingGameAction("give-clue"),
    turns.controllers.giveClue,
  );
  router.post(
    "/games/:gameId/rounds/:roundNumber/guesses",
    gameRole(PLAYER_ROLE.CODEBREAKER),
    blockingGameAction("make-guess"),
    turns.controllers.makeGuess,
  );
  router.post(
    "/games/:gameId/rounds/:roundNumber/end-turn",
    gameRole(PLAYER_ROLE.CODEBREAKER),
    blockingGameAction("end-turn"),
    turns.controllers.endTurn,
  );
  router.post(
    "/games/:gameId/rounds/:roundNumber/turns",
    gameRole(PLAYER_ROLE.CODEBREAKER),
    blockingGameAction("start-turn"),
    turns.controllers.startTurn,
  );

  app.use("/api", router);
  app.use("/api", gameplayErrorHandler(logger));

  return {
    giveClueService: turns.services.giveClue,
    makeGuessService: turns.services.makeGuess,
    endTurnService: turns.services.endTurn,
    startTurnService: turns.services.startTurn,
    loadGameAggregate,
  };
};
