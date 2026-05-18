import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import { Kysely } from "kysely";
import type { DB } from "@backend/shared/db/db.types";
import {
  sendError,
  sendSuccess,
} from "@backend/shared/http-middleware/controller-helpers";

/** Wiring dependencies for the get-user controller. */
export type Dependencies = {
  db: Kysely<DB>;
};

/**
 * `GET /api/users/:username` — returns the authenticated user's own record.
 *
 * Returns 401 when no JWT identity is attached, 403 when the URL username
 * doesn't match the JWT identity, 404 when the user row is missing.
 */
export const getUserController =
  ({ db }: Dependencies) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { username } = req.params;

      // Auth middleware already validated JWT and attached req.auth
      if (!req.auth) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      // Only allow users to get their own info
      if (req.auth.username !== username) {
        sendError(res, 403, "Forbidden - You can only access your own user information");
        return;
      }

      const user = await db
        .selectFrom("users")
        .select(["id", "username", "created_at"])
        .where("username", "=", username)
        .executeTakeFirst();

      if (!user) {
        sendError(res, 404, "User not found");
        return;
      }

      sendSuccess(res, 200, {
        userId: user.id,
        username: user.username,
        createdAt: user.created_at,
      });
    } catch (error) {
      next(error);
    }
  };
