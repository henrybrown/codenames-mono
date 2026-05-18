import {
  createFeatureErrorHandler,
  type FeatureErrorApiResponse,
} from "@backend/shared/http-middleware/feature-error-handler.middleware";
import type { AppLogger } from "@backend/shared/logging";
import { UnexpectedAuthError } from "./auth.errors";

/** Response shape returned by the auth error handler. */
export type { FeatureErrorApiResponse as AuthErrorApiResponse };

/**
 * Middleware that handles authentication-specific errors.
 *
 * Catches UnexpectedAuthError + NoResultError (DB lookup failures) →
 * 500. UnauthorizedError (JWT) → 401. Anything else → next(err) so
 * the top-level handler can deal with it.
 *
 * Response is enriched with stack/cause when in development mode.
 *
 * 4xx client errors are returned by controllers themselves; this is a
 * safety net for genuinely unexpected errors only.
 */
export const authErrorHandler = (logger: AppLogger) =>
  createFeatureErrorHandler({
    featureName: "auth",
    errorClass: UnexpectedAuthError,
    logger,
  });
