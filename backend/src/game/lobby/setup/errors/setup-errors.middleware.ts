import {
  createFeatureErrorHandler,
  type FeatureErrorApiResponse,
} from "@backend/shared/http-middleware/feature-error-handler.middleware";
import type { AppLogger } from "@backend/shared/logging";
import { UnexpectedSetupError } from "./setup.errors";

export type { FeatureErrorApiResponse as SetupErrorApiResponse };

/**
 * Error handling middleware for setup-related errors.
 *
 * Catches UnexpectedSetupError + NoResultError → 500.
 * UnauthorizedError (JWT) → 401. Anything else → next(err).
 *
 * Response includes stack/cause in development mode.
 */
export const setupErrorHandler = (logger: AppLogger) =>
  createFeatureErrorHandler({
    featureName: "setup",
    errorClass: UnexpectedSetupError,
    logger,
  });
