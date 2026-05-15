import { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { AppLogger } from "@backend/shared/logging";

export interface AuthRequest extends Request {
  id?: string;
  auth?: {
    userId: number;
    username: string;
  };
}

export type AuthMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => void;

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
