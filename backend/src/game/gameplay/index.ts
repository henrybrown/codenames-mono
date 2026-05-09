import { Express } from "express";
import { Kysely } from "kysely";
import { DB } from "@backend/shared/db/db.types";
import { Router } from "express";
import { AuthMiddleware } from "@backend/shared/http-middleware/auth.middleware";
import type { HttpLoggerHandler } from "@backend/shared/http-middleware/http-logger.middleware";
import { blockingGameAction } from "@backend/shared/http-middleware/blocking-game-action.middleware";
import type { AppLogger } from "@backend/shared/logging";

import { gameplayState, turnState } from "./state";
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
  const {
    provider: getGameplayState,         // new — discriminated-union input
    legacyProvider: getGameState,       // old — positional args; consumers migrate in steps 3-5
    loader: loadGameData,
    loadGameAggregate,
    verifyMembership,
    resolvePlayerContext,
  } = gameplayState(db);
  const { provider: getTurnState, getTurnsByRoundId, findPlayersByRoundId } = turnState(db);

  /** Gameplay actions (transactional handler) */
  const { handler: gameplayHandler } = gameplayActions(db);

  /** Queries */
  const queries = createQueries(logger)({
    getGameState,
    getGameplayState,
    loadGameData,
    getTurnState,
    getTurnsByRoundId,
    findPlayersByRoundId,
    db,
  });

  /** Turns (clue, guess, end-turn, start-turn) */
  const turns = createTurns(logger)({
    getGameState,
    getGameplayState,
    gameplayHandler,
    getTurnState,
    loadGameData,
  });

  /** Routes */
  const router = Router();
  router.use(httpLogger(logger));

  router.get("/games/:gameId", auth, queries.controllers.getGame);
  router.get("/games/:gameId/players", auth, queries.controllers.getPlayers);
  router.get("/games/:gameId/events", auth, queries.controllers.getEvents);
  router.post("/games/:gameId/rounds/:roundNumber/clues", auth, blockingGameAction("give-clue"), turns.controllers.giveClue);
  router.post("/games/:gameId/rounds/:roundNumber/guesses", auth, blockingGameAction("make-guess"), turns.controllers.makeGuess);
  router.post("/games/:gameId/rounds/:roundNumber/end-turn", auth, blockingGameAction("end-turn"), turns.controllers.endTurn);
  router.post("/games/:gameId/rounds/:roundNumber/turns", auth, blockingGameAction("start-turn"), turns.controllers.startTurn);
  router.get("/turns/:turnId", auth, queries.controllers.getTurn);

  app.use("/api", router);
  app.use("/api", gameplayErrorHandler(logger));

  return {
    giveClueService: turns.services.giveClue,
    makeGuessService: turns.services.makeGuess,
    endTurnService: turns.services.endTurn,
    startTurnService: turns.services.startTurn,
    getGameState,                       // legacy — chat consumes (membership-only)
    getGameplayState,                   // new — primary read-only entry point
    loadGameAggregate,
    verifyMembership,
    resolvePlayerContext,
    loadGameData,                       // legacy alias for loadGameAggregate
  };
};
