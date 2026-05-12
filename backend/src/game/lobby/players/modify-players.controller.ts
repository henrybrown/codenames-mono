import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";

import {
  modifySinglePlayerRequestSchema,
  modifyBatchPlayersRequestSchema,
} from "./modify-players.validation";

import { modifyPlayersService } from "./modify-players.service";

export interface ModifyPlayersController {
  controllers: {
    single: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    batch: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  };
}

// Dependencies interface
export interface Dependencies {
  modifyPlayersService: ReturnType<typeof modifyPlayersService>;
}

// Controller factory
export const modifyPlayersController = ({
  modifyPlayersService,
}: Dependencies): ModifyPlayersController => {
  const handleSingle = async (
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
        res.status(status).json({ success: false, error: result.message });
        return;
      }

      const { modifiedPlayers } = result.data;

      const response = {
        success: true,
        data: {
          player: {
            id: modifiedPlayers[0].publicId,
            playerName: modifiedPlayers[0].playerName,
            username: modifiedPlayers[0].username,
            teamName: modifiedPlayers[0].teamName,
            isActive: modifiedPlayers[0].statusId === 1,
          },
          gameId: validatedReq.params.gameId,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  // Batch handler
  const handleBatch = async (
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
        res.status(status).json({ success: false, error: result.message });
        return;
      }

      const { modifiedPlayers } = result.data;

      const response = {
        success: true,
        data: {
          players: modifiedPlayers.map((player) => ({
            id: player.publicId,
            playerName: player.playerName,
            username: player.username,
            teamName: player.teamName,
            isActive: player.statusId === 1,
          })),
          gameId,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  return {
    controllers: { single: handleSingle, batch: handleBatch },
  };
};
