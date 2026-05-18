import { Request, Response, NextFunction } from "express";
import { generateAdditionalErrorInfo } from "./add-error-details.helper";
import type { AppLogger } from "@backend/shared/logging";

type ErrorResponse = {
  success: boolean;
  error: string;
  details?: {};
};

/**
 * Builds the top-level Express error handler (4-arg middleware).
 *
 * Catches anything that wasn't handled by a feature-scoped handler and
 * returns 500. In development, attaches stack/cause/body details to aid
 * debugging; in production, returns a generic message only.
 */
export const errorHandler = (logger: AppLogger) => (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const errorResponse: ErrorResponse = {
    success: false,
    error: "An unexpected error occurred",
  };

  if (process.env.NODE_ENV === "development") {
    const errorDetails = generateAdditionalErrorInfo(err, req);
    errorResponse.details = errorDetails;
  }

  logger.error(`${req.method} ${req.path}: ${err.message}`, errorResponse);

  res.status(500).json(errorResponse);
};

/**
 * Catch-all middleware that returns 404 for unmatched routes.
 *
 * Mounted after all route handlers so it only fires when nothing else
 * accepted the request.
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
  });
};
