import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { TriggerMoveService } from "./trigger-move.service";
import { z } from "zod";
import {
  requireUserId,
  sendError,
  sendSuccess,
} from "@backend/shared/http-middleware/controller-helpers";

const triggerMoveParamsSchema = z.object({
  gameId: z.string().min(1, "Game ID is required"),
});

export interface TriggerMoveControllerDeps {
  triggerMove: TriggerMoveService;
}

export const triggerMoveController = (deps: TriggerMoveControllerDeps) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { gameId } = triggerMoveParamsSchema.parse(req.params);
      const userId = requireUserId(req, res);
      if (userId === null) return;

      const result = await deps.triggerMove(gameId, userId);

      if (result.status === "game-not-found") {
        sendError(res, 404, "Game not found or you are not a player in this game");
        return;
      }

      if (result.status === "unauthorized") {
        sendError(res, 403, "You do not have access to this game");
        return;
      }

      if (result.status === "not-ai-turn") {
        sendError(res, 409, "It is not currently the AI's turn");
        return;
      }

      if (result.status === "already-running") {
        sendError(res, 409, "AI is already thinking");
        return;
      }

      // 202 Accepted since the AI move runs asynchronously
      sendSuccess(res, 202, result.run);
    } catch (error) {
      next(error);
    }
  };
