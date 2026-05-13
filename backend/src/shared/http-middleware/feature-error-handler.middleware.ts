import { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "express-jwt";
import { NoResultError } from "kysely";
import { generateAdditionalErrorInfo } from "./add-error-details.helper";
import type { JsonObject } from "swagger-ui-express";
import type { AppLogger } from "@backend/shared/logging";

/**
 * Standard error response shape returned by every feature error handler.
 */
export type FeatureErrorApiResponse = {
  success: false;
  error: string;
  details?: { stack?: JsonObject; cause?: unknown; req?: Request };
};

/**
 * Type guard interface for feature-specific error classes.
 * Used by createFeatureErrorHandler to narrow on `err instanceof FeatureError`.
 */
type ErrorClass<E extends Error> = new (...args: never[]) => E;

/**
 * Factory that builds a feature-scoped error-handling middleware.
 *
 * Standardises the four near-identical handlers we had previously
 * (auth, lobby, setup, gameplay). Each was: build a 500 response,
 * add dev details, log the error, branch on instanceof, dispatch
 * status. This factory captures that shape once.
 *
 * Responsibilities, in order:
 *   1. JWT 401 (UnauthorizedError) — always
 *   2. Feature-specific error class → 500
 *   3. NoResultError (kysely) → 500
 *   4. Anything else → next(err)
 *
 * If you need to map a feature-specific class to a non-500 status
 * (i.e. validation errors that should be 4xx), do that inside the
 * service / controller before throwing — the middleware is a safety
 * net for genuinely unexpected errors only.
 */
export const createFeatureErrorHandler = <E extends Error>(opts: {
  featureName: string;
  errorClass: ErrorClass<E>;
  logger: AppLogger;
}) => {
  const { featureName, errorClass, logger } = opts;
  return (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const errorResponse: FeatureErrorApiResponse = {
      success: false,
      error: "An unexpected error occurred",
    };

    if (process.env.NODE_ENV === "development") {
      errorResponse.details = generateAdditionalErrorInfo(err, req);
    }

    logger.error(
      `[${featureName}] ${req.method} ${req.path}: ${err.message}`,
      errorResponse,
    );

    if (err instanceof UnauthorizedError) {
      res.status(401).json(errorResponse);
      return;
    }

    if (err instanceof errorClass || err instanceof NoResultError) {
      res.status(500).json(errorResponse);
      return;
    }

    next(err);
  };
};
