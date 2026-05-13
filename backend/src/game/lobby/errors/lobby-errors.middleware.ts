import {
  createFeatureErrorHandler,
  type FeatureErrorApiResponse,
} from "@backend/shared/http-middleware/feature-error-handler.middleware";
import type { AppLogger } from "@backend/shared/logging";
import { UnexpectedLobbyError } from "./lobby.errors";

export type { FeatureErrorApiResponse as LobbyErrorApiResponse };

/**
 * Error handling middleware for lobby-related errors.
 *
 * Catches UnexpectedLobbyError + NoResultError → 500.
 * UnauthorizedError (JWT) → 401. Anything else → next(err).
 *
 * Response includes stack/cause in development mode.
 */
export const lobbyErrorHandler = (logger: AppLogger) =>
  createFeatureErrorHandler({
    featureName: "lobby",
    errorClass: UnexpectedLobbyError,
    logger,
  });
