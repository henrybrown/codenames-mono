import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { GetEventsService } from "./get-events.service";
import { z } from "zod";

const getEventsParamsSchema = z.object({
  gameId: z.string().min(1, "Game ID is required"),
});

export interface GetEventsControllerDeps {
  getEvents: GetEventsService;
}

export const getEventsController = (deps: GetEventsControllerDeps) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { gameId } = getEventsParamsSchema.parse(req.params);
      const userId = req.auth?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      const result = await deps.getEvents(gameId, userId);

      if (result.status === "game-not-found") {
        res.status(404).json({
          success: false,
          error: "Game not found or you are not a player in this game",
        });
        return;
      }

      if (result.status === "unauthorized") {
        res.status(403).json({
          success: false,
          error: "You do not have access to this game",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: result.events,
      });
    } catch (error) {
      next(error);
    }
  };
