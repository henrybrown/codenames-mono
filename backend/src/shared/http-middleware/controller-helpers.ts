import type { Response } from "express";
import type { Request } from "express-jwt";
import type { AppLogger } from "@backend/shared/logging";

/** Optional payload attached to the error envelope; currently only `validationErrors`. */
export type ErrorDetails = {
  validationErrors?: { path: string; message: string }[];
};

/** Send a uniform error response shape: `{ success: false, error, details? }`. */
export const sendError = (
  res: Response,
  status: number,
  error: string,
  details?: ErrorDetails,
): void => {
  const body: { success: false; error: string; details?: ErrorDetails } = {
    success: false,
    error,
  };
  if (details) body.details = details;
  res.status(status).json(body);
};

/** Send a uniform success response shape: `{ success: true, data }`. */
export const sendSuccess = <T>(res: Response, status: number, data: T): void => {
  res.status(status).json({ success: true, data });
};

/**
 * Read `req.auth.userId`. Returns the id on success, or sends 401 and
 * returns null. Callers early-return on null to keep the happy path
 * unindented. Auth middleware is expected to have already populated
 * `req.auth`; this is the defensive last-mile check.
 */
export const requireUserId = (req: Request, res: Response): number | null => {
  const userId = req.auth?.userId;
  if (!userId) {
    sendError(res, 401, "Authentication required");
    return null;
  }
  return userId;
};

/** Build a per-endpoint child logger. Wraps the repeated builder chain. */
export const endpointLogger = (logger: AppLogger, endpoint: string): AppLogger =>
  logger.for({}).withMeta({ endpoint }).create();
