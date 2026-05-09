/**
 * Chat Module
 *
 * Composes the chat feature from two sub-features:
 *   - get-messages/    HTTP route to read game messages (chat + AI thinking + system)
 *   - submit-message/  HTTP route for players to post chat messages
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

import type { GameplayStateProvider } from "@backend/game/gameplay/state/gameplay-state.provider";

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
  getGameState: GameplayStateProvider;
};

export type ChatModuleDependencies = {
  // Infra
  app: Express;
  db: Kysely<DB>;
  auth: AuthMiddleware;
  httpLogger: HttpLoggerHandler;
  appLogger: AppLogger;
  // Cross-feature
  gameplay: GameplayFeature;
};

export const initialize = (deps: ChatModuleDependencies) => {
  const { app, db, auth, httpLogger, appLogger, gameplay } = deps;

  const logger = appLogger.for({ feature: "chat" }).create();

  /** Repositories — bound once from db, threaded down as typed functions */
  const repositories = {
    findMessagesByGame: gameMessagesRepo.findMessagesByGame(db),
    createGameMessage:  gameMessagesRepo.createMessage(db),
  };

  /** Sub-features */
  const getMessagesFeature = createGetMessages(logger)({
    getGameState: gameplay.getGameState,
    findMessagesByGame: repositories.findMessagesByGame,
  });

  const submitMessageFeature = createSubmitMessage(logger)({
    getGameState: gameplay.getGameState,
    createGameMessage: repositories.createGameMessage,
  });

  /** Routes */
  const router = Router();
  router.use(httpLogger(logger));
  router.get(
    "/games/:gameId/messages",
    auth,
    getMessagesFeature.controller,
  );
  router.post(
    "/games/:gameId/messages",
    auth,
    submitMessageFeature.controller,
  );
  app.use("/api", router);

  logger.info("Chat module initialized");

  return {
    getMessages: getMessagesFeature,
    submitMessage: submitMessageFeature,
  };
};

export default initialize;
