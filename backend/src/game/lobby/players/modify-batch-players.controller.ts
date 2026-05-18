import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";

import { modifyBatchPlayersRequestSchema } from "./modify-players.validation";
import { modifyPlayersService } from "./modify-players.service";
import { sendError, sendSuccess } from "@backend/shared/http-middleware/controller-helpers";

/** Wiring dependencies for the batch modify-players controller. */
export interface Dependencies {
  modifyPlayersService: ReturnType<typeof modifyPlayersService>;
}

/**
 * `PATCH /api/games/:gameId/players` — modify multiple players in one
 * call. Each body entry must carry its own `playerId`.
 */
export const modifyBatchPlayersController = ({
  modifyPlayersService,
}: Dependencies) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validatedReq = modifyBatchPlayersRequestSchema.parse({
        params: req.params,
        body: req.body,
        auth: req.auth,
      });

      const gameId = validatedReq.params.gameId;
      const playersToModify = validatedReq.body;

      const result = await modifyPlayersService(
        gameId,
        playersToModify,
        validatedReq.auth.userId,
      );

      if (!result.success) {
        const status = result.notFound === true ? 404 : 400;
        sendError(res, status, result.message);
        return;
      }

      const { modifiedPlayers } = result.data;

      sendSuccess(res, 200, {
        players: modifiedPlayers.map((player) => ({
          id: player.publicId,
          playerName: player.playerName,
          username: player.username,
          teamName: player.teamName,
          isActive: player.statusId === 1,
        })),
        gameId,
      });
    } catch (error) {
      next(error);
    }
  };
};
