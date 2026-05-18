import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type {
  GameFinder,
  PublicId as GamePublicId,
} from "@backend/shared/data-access/repositories/games.repository";
import type { PlayerFinderByGameAndUser } from "@backend/shared/data-access/repositories/players.repository";
import { GAME_TYPE, type PlayerRole } from "@codenames/shared/types";

/** Repository bindings needed by the role gate. */
export type RequireGameRoleDeps = {
  getGameByPublicId: GameFinder<GamePublicId>;
  getPlayerByGameAndUser: PlayerFinderByGameAndUser;
};

/**
 * Builds the role-gating middleware factory.
 *
 * Returns a function that takes one role (or a list of allowed roles) and
 * yields the actual middleware. The middleware returns 400 on missing
 * gameId/userId, 404 on missing game, 403 when the user isn't a player or
 * their role isn't in `allowed`. Single-device games short-circuit to
 * `next()` after the existence check — controllers enforce role-from-body.
 *
 * Doesn't mutate `req`; route handlers do their own loading.
 */
export const requireGameRole =
  (deps: RequireGameRoleDeps) =>
  (allowed: PlayerRole | PlayerRole[]) =>
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

      // Single-device passthrough — branch before any player lookup
      if (game.game_type === GAME_TYPE.SINGLE_DEVICE) {
        next();
        return;
      }
    
      const player = await deps.getPlayerByGameAndUser(game._id, userId);
      if (!player) {
        res.status(403).json({ success: false, error: "Not a player in this game" });
        return;
      }
      
      const allowedList = Array.isArray(allowed) ? allowed : [allowed];
      if (!allowedList.includes(player.role)) {
        res.status(403).json({
          success: false,
          error: `This action requires role: ${allowedList.join(" or ")}`,
        });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
