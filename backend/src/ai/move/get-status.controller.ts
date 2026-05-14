import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { getStatusService } from "./get-status.service";
import { z } from "zod";
import {
  requireUserId,
  sendError,
  sendSuccess,
} from "@backend/shared/http-middleware/controller-helpers";

const getStatusParamsSchema = z.object({
  gameId: z.string().min(1, "Game ID is required"),
});

export interface GetStatusControllerDeps {
  getStatus: ReturnType<typeof getStatusService>;
}

export const getStatusController = (deps: GetStatusControllerDeps) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { gameId } = getStatusParamsSchema.parse(req.params);
      const userId = requireUserId(req, res);
      if (userId === null) return;

      const result = await deps.getStatus(gameId, userId);

      if (result.status === "game-not-found") {
        sendError(res, 404, "Game not found or you are not a player in this game");
        return;
      }

      if (result.status === "unauthorized") {
        sendError(res, 403, "You do not have access to this game");
        return;
      }

      sendSuccess(res, 200, result.aiStatus);
    } catch (error) {
      next(error);
    }
  };
