import { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { AppLogger } from "@backend/shared/logging";

/**
 * `Request` augmented with the JWT-derived identity.
 *
 * `id` is a per-request UUID assigned by the middleware for log
 * correlation. `auth` is populated only after successful token verify.
 */
export interface AuthRequest extends Request {
  id?: string;
  auth?: {
    userId: number;
    username: string;
  };
}

/** Signature of the Express middleware returned by `authMiddleware`. */
export type AuthMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => void;

/**
 * Builds the JWT auth middleware.
 *
 * Accepts the token from the `authToken` cookie or an `Authorization:
 * Bearer ...` header. Sets `req.auth` on success or responds 401 with a
 * generic message (token verification failures are logged at warn level
 * with the underlying reason).
 */
export const authMiddleware = (jwtSecret: string, logger?: AppLogger): AuthMiddleware => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    req.id = req.id ?? crypto.randomUUID();

    try {
      let token = req.cookies?.authToken;

      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }

      if (!token) {
        return res.status(401).json({
          success: false,
          error: "No authentication token provided",
        });
      }

      const decoded = jwt.verify(token, jwtSecret) as {
        userId: number;
        username: string;
      };

      req.auth = {
        userId: decoded.userId,
        username: decoded.username,
      };

      next();
    } catch (error) {
      logger?.warn(`auth_middleware_error: ${error instanceof Error ? error.message : "unknown"}`);
      return res.status(401).json({
        success: false,
        error: "Invalid or expired token",
      });
    }
  };
};
