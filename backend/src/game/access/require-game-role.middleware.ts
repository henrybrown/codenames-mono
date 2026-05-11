/**
 * Express middleware: gates a route on the user's role in the game.
 *
 * Behaviour:
 *   1. Validates auth + game existence (404 if game not found).
 *   2. Single-device games: passes through. The role is body-supplied
 *      for single-device, and controllers do their own role-from-body
 *      validation. We've confirmed the game exists; that's enough.
 *   3. Multi-device games: looks up the user's player (single repo call
 *      via findPlayerByGameAndUser); rejects with 403 unless the player's
 *      role is in `allowed`.
 *
 * Mutates nothing on req. Controllers do their own loading.
 *
 * Usage:
 *   const gameRole = requireGameRole({ getGameByPublicId, getPlayerByGameAndUser });
 *   router.post(".../clues",   gameRole("CODEMASTER"),   blockingGameAction("..."), ctrl);
 *   router.post(".../guesses", gameRole("CODEBREAKER"),  blockingGameAction("..."), ctrl);
 */

import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type {
  GameFinder,
  PublicId as GamePublicId,
} from "@backend/shared/data-access/repositories/games.repository";
import type { PlayerFinderByGameAndUser } from "@backend/shared/data-access/repositories/players.repository";
import { GAME_TYPE, type PlayerRole } from "@codenames/shared/types";

export type RequireGameRoleDeps = {
  getGameByPublicId: GameFinder<GamePublicId>;
  getPlayerByGameAndUser: PlayerFinderByGameAndUser;
};

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
