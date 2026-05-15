import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import { z } from "zod";
import type { EndTurnService } from "./end-turn.service";
import type { AppLogger } from "@backend/shared/logging";
import {
  endpointLogger,
  sendError,
  sendSuccess,
} from "@backend/shared/http-middleware/controller-helpers";
import { pickStatus } from "@backend/shared/http/result-status";
import { PLAYER_ROLE } from "@codenames/shared/types";

const requestSchema = z.object({
  params: z.object({
    gameId: z.string().min(1),
    roundNumber: z.string().transform(Number).refine((n) => n > 0),
  }),
  body: z.object({
    // Both optional; service picks the right one based on game_type.
    role: z.enum([PLAYER_ROLE.CODEMASTER, PLAYER_ROLE.CODEBREAKER]).optional(),
    playerId: z.string().min(1).optional(),
  }),
  auth: z.object({
    userId: z.number().int().positive(),
  }),
});

export type EndTurnControllerDeps = {
  endTurn: EndTurnService;
};

export const createEndTurnController =
  (logger: AppLogger) =>
  (deps: EndTurnControllerDeps) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const log = endpointLogger(logger, "POST /end-turn");
    try {
      const parsed = requestSchema.safeParse({
        params: req.params,
        body: req.body ?? {},
        auth: req.auth,
      });
      if (!parsed.success) {
        sendError(res, 400, "Invalid request");
        return;
      }
      const { params, body, auth } = parsed.data;
      const result = await deps.endTurn({
        gameId: params.gameId,
        roundNumber: params.roundNumber,
        userId: auth.userId,
        role: body.role,
        playerId: body.playerId,
      });
      if (!result.success) {
        log.warn(`Response: ${result.message}`);
        sendError(res, pickStatus(result), result.message);
        return;
      }
      log.info("Response: 200");
      sendSuccess(res, 200, result.data);
    } catch (error) {
      next(error);
    }
  };
