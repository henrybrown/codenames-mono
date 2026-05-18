/**
 * Chat Module
 *
 * Composes the chat feature from two sub-features:
 *   - queries/  HTTP route to read game messages (chat + AI thinking + system)
 *   - submit/   HTTP route for players to post chat messages
 *
 * This file is the single place that touches `db` — repositories are bound
 * here once and passed down to sub-features as typed function dependencies.
 *
 * Note: AI_THINKING messages are written by the AI feature directly via its
 * own `createGameMessage` repo binding. Chat does not own writes for those —
 * the two features share the underlying `game_messages` table, but each
 * feature owns its own write path. See ai/index.ts for the AI write binding.
 */

import type { Express } from "express";
import { Router } from "express";
import type { Kysely } from "kysely";
import type { DB } from "@backend/shared/db/db.types";
import type { AuthMiddleware } from "@backend/shared/http-middleware/auth.middleware";
import type { HttpLoggerHandler } from "@backend/shared/http-middleware/http-logger.middleware";
import type { AppLogger } from "@backend/shared/logging";

import * as gameMessagesRepo from "@backend/shared/data-access/repositories/game-messages.repository";
import * as gamesRepo from "@backend/shared/data-access/repositories/games.repository";
import * as playersRepo from "@backend/shared/data-access/repositories/players.repository";

import type { GameAggregateLoader } from "@backend/game/state/load-game-aggregate";
import { requireGameMember } from "@backend/game/access";

import { createGetMessages } from "./queries";
import { createSubmitMessage } from "./submit";

export type { GameMessage } from "./game-message";

/**
 * The slice of the gameplay feature that chat consumes.
 *
 * Defined here (rather than in `game/gameplay/`) so the cross-feature
 * contract is owned by chat: gameplay can grow new exports without
 * widening chat's contract, and renames in gameplay produce type
 * errors exactly at the chat boundary.
 */
export type GameplayFeature = {
  state: {
    loadGameAggregate: GameAggregateLoader;
  };
};

/** Wiring dependencies for the chat module. */
export type ChatModuleDependencies = {
  app: Express;
  db: Kysely<DB>;
  auth: AuthMiddleware;
  httpLogger: HttpLoggerHandler;
  appLogger: AppLogger;
  gameplay: GameplayFeature;
};

/**
 * Initializes the chat feature — registers the read and submit routes and
 * mounts them under `/api/games/:gameId/messages`.
 *
 * Side effects: mounts the chat router (with auth + game-membership
 * middleware) onto `deps.app` and logs an initialization message. Returns
 * the controllers and services for callers that need direct access.
 */
export const initialize = (deps: ChatModuleDependencies) => {
  const { app, db, auth, httpLogger, appLogger, gameplay } = deps;

  const logger = appLogger.for({ feature: "chat" }).create();

  const repositories = {
    findMessagesByGame: gameMessagesRepo.findMessagesByGame(db),
    createGameMessage:  gameMessagesRepo.createMessage(db),
  };

  const requireMember = requireGameMember({
    getGameByPublicId: gamesRepo.findGameByPublicId(db),
    getPlayerByGameAndUser: playersRepo.findPlayerByGameAndUser(db),
  });

  const getMessagesFeature = createGetMessages(logger)({
    loadGameAggregate: gameplay.state.loadGameAggregate,
    findMessagesByGame: repositories.findMessagesByGame,
  });

  const submitMessageFeature = createSubmitMessage(logger)({
    loadGameAggregate: gameplay.state.loadGameAggregate,
    createGameMessage: repositories.createGameMessage,
  });

  const router = Router();
  router.use(httpLogger(logger));
  router.use(auth);
  router.use("/games/:gameId", requireMember);
  router.get("/games/:gameId/messages", getMessagesFeature.controllers.getMessages);
  router.post("/games/:gameId/messages", submitMessageFeature.controllers.submitMessage);
  app.use("/api", router);

  logger.info("Chat module initialized");

  return {
    controllers: {
      ...getMessagesFeature.controllers,
      ...submitMessageFeature.controllers,
    },
    services: {
      ...getMessagesFeature.services,
      ...submitMessageFeature.services,
    },
  };
};

export default initialize;
