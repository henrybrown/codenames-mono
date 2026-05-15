import { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { parse as parseCookie } from "cookie";
import type { AppLogger } from "@backend/shared/logging";

export interface AuthenticatedSocket extends Socket {
  auth?: {
    userId: number;
    username: string;
  };
}

export const createWebSocketAuthMiddleware = (jwtSecret: string, logger?: AppLogger) => {
  return (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
    try {
      let token: string | undefined;

      const cookieHeader = socket.handshake.headers.cookie;
      if (cookieHeader) {
        const cookies = parseCookie(cookieHeader);
        token = cookies.authToken;
      }

      if (!token) {
        const authHeader = socket.handshake.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        } else if (socket.handshake.auth.token) {
          // Socket.io client can pass token in auth object
          token = socket.handshake.auth.token;
        }
      }

      if (!token) {
        return next(new Error("Authentication token missing"));
      }

      const decoded = jwt.verify(token, jwtSecret) as {
        userId: number;
        username: string;
      };

      socket.auth = {
        userId: decoded.userId,
        username: decoded.username,
      };

      next();
    } catch (error) {
      logger?.warn(`websocket_auth_error: ${error instanceof Error ? error.message : "unknown"}`);
      next(new Error("Invalid or expired token"));
    }
  };
};
