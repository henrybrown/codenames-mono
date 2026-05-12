import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";

import { modifySinglePlayerRequestSchema } from "./modify-players.validation";
import { modifyPlayersService } from "./modify-players.service";
import { sendError, sendSuccess } from "@backend/shared/http-middleware/controller-helpers";

export interface Dependencies {
  modifyPlayersService: ReturnType<typeof modifyPlayersService>;
}

/**
 * Handler for `PATCH /games/:gameId/players/:playerId` — modify one
 * player. The body's `playerId` plus the path `playerId` are validated
 * together; the service accepts a one-element array.
 */
export const modifySinglePlayerController = ({
  modifyPlayersService,
}: Dependencies) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validatedReq = modifySinglePlayerRequestSchema.parse({
        params: req.params,
        body: req.body,
        auth: req.auth,
      });

      const result = await modifyPlayersService(
        validatedReq.params.gameId,
        [{ ...validatedReq.body }],
        validatedReq.auth.userId,
      );

      if (!result.success) {
        const status = result.notFound === true ? 404 : 400;
        sendError(res, status, result.message);
        return;
      }

      const { modifiedPlayers } = result.data;

      sendSuccess(res, 200, {
        player: {
          id: modifiedPlayers[0].publicId,
          playerName: modifiedPlayers[0].playerName,
          username: modifiedPlayers[0].username,
          teamName: modifiedPlayers[0].teamName,
          isActive: modifiedPlayers[0].statusId === 1,
        },
        gameId: validatedReq.params.gameId,
      });
    } catch (error) {
      next(error);
    }
  };
};
