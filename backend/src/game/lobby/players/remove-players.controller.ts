import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import { removePlayersService } from "./remove-players.service";
import {
  removePlayersRequestSchema,
  removePlayersResponseSchema,
} from "./remove-players.validation";

/** Wiring dependencies for the remove-player controller. */
export type Dependencies = {
  removePlayersService: ReturnType<typeof removePlayersService>;
};

/**
 * `DELETE /api/games/:gameId/players/:playerId` — removes a player from
 * a lobby. 404 on missing game/player, 400 for other expected failures.
 */
export const removePlayersController =
  ({ removePlayersService }: Dependencies) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedRequest = removePlayersRequestSchema.parse({
        params: req.params,
        auth: req.auth,
      });

      const gameId = validatedRequest.params.gameId;
      const userId = validatedRequest.auth.userId;
      const playerIdToRemove = validatedRequest.params.playerId;

      const result = await removePlayersService(
        gameId,
        userId,
        playerIdToRemove,
      );

      if (!result.success) {
        const status = result.notFound === true ? 404 : 400;
        res.status(status).json({ success: false, error: result.message });
        return;
      }

      const { removedPlayer } = result.data;

      const response = {
        success: true,
        data: {
          removedPlayer: {
            id: removedPlayer.publicId,
            playerName: removedPlayer.playerName,
            username: removedPlayer.username,
            teamName: removedPlayer.teamName,
            isActive: removedPlayer.statusId === 1,
          },
          gameId,
        },
      };

      const validatedResponse = removePlayersResponseSchema.parse(response);

      res.status(200).json(validatedResponse);
    } catch (error) {
      next(error);
    }
  };
