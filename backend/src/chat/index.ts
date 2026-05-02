import type { Express } from "express";
import { Router } from "express";
import type { GameplayStateProvider } from "@backend/game/gameplay/state/gameplay-state.provider";
import type { DbContext } from "@backend/shared/data-access/transaction-handler";
import type { AuthMiddleware } from "@backend/shared/http-middleware/auth.middleware";

// todo: clean chat feature

import getMessages from "./get-messages";
import submitMessage from "./submit-message";

/**
 * Dependencies required by the chat feature
 */
export interface ChatDependencies {
  app: Express;
  auth: AuthMiddleware;
  getGameState: GameplayStateProvider;
  db: DbContext;
}

/**
 * Initializes the chat feature with all sub-features and registers routes
 */
export const initialize = (dependencies: ChatDependencies) => {
  const { app, auth, getGameState, db } = dependencies;

  const getMessagesFeature = getMessages({ getGameState, db });
  const submitMessageFeature = submitMessage({ getGameState, db });

  const router = Router();
  router.get("/games/:gameId/messages", auth, getMessagesFeature.controller);
  router.post("/games/:gameId/messages", auth, submitMessageFeature.controller);
  app.use("/api", router);

  return {
    getMessages: getMessagesFeature,
    submitMessage: submitMessageFeature,
  };
};

export default initialize;
