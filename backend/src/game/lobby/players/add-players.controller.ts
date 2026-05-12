import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import { addPlayersService } from "./add-players.service";
import {
  addPlayersRequestSchema,
  addPlayersResponseSchema,
  AddPlayersResponse,
} from "./add-players.validation";

/** Dependencies required for the add players controller */
export type Dependencies = {
  addPlayers: ReturnType<typeof addPlayersService>;
};

/** Creates a controller for adding players to a game lobby */
export const addPlayersController =
  ({ addPlayers }: Dependencies) =>
  /**
   * Handles HTTP request to add players to a game
   * @param req - Express request with game and player details
   * @param res - Express response object
   * @param next - Express error handling function
   */
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedRequest = addPlayersRequestSchema.parse({
        body: req.body,
        params: req.params,
        auth: req.auth,
      });

      const gameId = validatedRequest.params.gameId;
      const userId = validatedRequest.auth.userId;

      // Normalize to array: convert single object to array of 1
      const playersToAdd = Array.isArray(validatedRequest.body)
        ? validatedRequest.body
        : [validatedRequest.body];

      const result = await addPlayers(gameId, userId, playersToAdd);

      if (!result.success) {
        const status = result.notFound === true ? 404 : 400;
        res.status(status).json({ success: false, error: result.message });
        return;
      }

      const { players, gamePublicId } = result.data;

      const response: AddPlayersResponse = {
        success: true,
        data: {
          players: players.map((player) => ({
            id: player.publicId,
            playerName: player.playerName,
            username: player.username,
            teamName: player.teamName,
            isActive: player.statusId === 1,
          })),
          gameId: gamePublicId,
        },
      };

      const validatedResponse = addPlayersResponseSchema.parse(response);

      res.status(201).json(validatedResponse);
    } catch (error) {
      next(error);
    }
  };
