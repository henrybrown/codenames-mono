/**
 * Express middleware: gates a route on game membership only.
 *
 * No role check — any player in the game passes. Single-device games are
 * passed through unconditionally (the device holder is treated as the
 * lobby owner; further validation belongs to the route handler).
 */

import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type {
  GameFinder,
  PublicId as GamePublicId,
} from "@backend/shared/data-access/repositories/games.repository";
import type { PlayerFinderByGameAndUser } from "@backend/shared/data-access/repositories/players.repository";
import { GAME_TYPE } from "@codenames/shared/types";

/** Repository bindings needed by the game-member gate. */
export type RequireGamePlayerDeps = {
  getGameByPublicId: GameFinder<GamePublicId>;
  getPlayerByGameAndUser: PlayerFinderByGameAndUser;
};

/**
 * Builds the game-membership middleware.
 *
 * Returns 400 on missing gameId/userId, 404 on missing game, 403 when the
 * user isn't a player. Single-device games short-circuit to `next()` after
 * the existence check.
 */
export const requireGamePlayer =
  (deps: RequireGamePlayerDeps) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawGameId = req.params.gameId;
      const gameId = Array.isArray(rawGameId) ? rawGameId[0] : rawGameId;
      const userId = req.auth?.userId as number | undefined;
      if (!gameId || !userId) {
        res.status(400).json({ success: false, error: "Missing gameId or auth" });
        return;
      }

      const game = await deps.getGameByPublicId(gameId);
      if (!game) {
        res.status(404).json({ success: false, error: "Game not found" });
        return;
      }

      // Single-device games: passthrough (lobby owner trust model).
      if (game.game_type === GAME_TYPE.SINGLE_DEVICE) {
        next();
        return;
      }

      const player = await deps.getPlayerByGameAndUser(game._id, userId);
      if (!player) {
        res.status(403).json({ success: false, error: "Not a player in this game" });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
