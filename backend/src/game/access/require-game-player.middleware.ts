/**
 * Express middleware: gates a route on game membership only.
 *
 * Same first three steps as requireGameRole, but no role check —
 * any player in the game passes. Used by chat (any role can chat)
 * and by routes that need member-presence without role specifics.
 *
 * Single-device games: passes through (any authenticated user holding
 * the device represents the lobby owner; further validation is the
 * controller's job).
 */

import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type {
  GameFinder,
  PublicId as GamePublicId,
} from "@backend/shared/data-access/repositories/games.repository";
import type { PlayerFinderByGameAndUser } from "@backend/shared/data-access/repositories/players.repository";
import { GAME_TYPE } from "@codenames/shared/types";

export type RequireGamePlayerDeps = {
  getGameByPublicId: GameFinder<GamePublicId>;
  getPlayerByGameAndUser: PlayerFinderByGameAndUser;
};

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
