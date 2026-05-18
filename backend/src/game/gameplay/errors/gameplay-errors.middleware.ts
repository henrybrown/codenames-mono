import {
  createFeatureErrorHandler,
  type FeatureErrorApiResponse,
} from "@backend/shared/http-middleware/feature-error-handler.middleware";
import type { AppLogger } from "@backend/shared/logging";
import { UnexpectedGameplayError } from "./gameplay.errors";

/** Response shape returned by the gameplay error handler. */
export type { FeatureErrorApiResponse as GameplayErrorApiResponse };

/**
 * Error handling middleware for gameplay-related errors.
 *
 * Catches UnexpectedGameplayError + NoResultError → 500.
 * UnauthorizedError (JWT) → 401. Anything else → next(err).
 *
 * Response includes stack/cause in development mode.
 *
 * 4xx client errors are returned by controllers themselves; this is a
 * safety net for genuinely unexpected errors only.
 */
export const gameplayErrorHandler = (logger: AppLogger) =>
  createFeatureErrorHandler({
    featureName: "gameplay",
    errorClass: UnexpectedGameplayError,
    logger,
  });
