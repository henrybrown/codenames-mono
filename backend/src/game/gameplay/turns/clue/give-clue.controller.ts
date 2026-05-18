import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import { z } from "zod";
import type { GiveClueService } from "./give-clue.service";
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
    word: z.string().min(1).max(50),
    targetCardCount: z.number().int().min(1).max(25),
    // Single-device identifies actor by role; multi-device by playerId.
    // Service decides which to use based on the loaded aggregate's game_type.
    role: z.enum([PLAYER_ROLE.CODEMASTER, PLAYER_ROLE.CODEBREAKER]).optional(),
    playerId: z.string().min(1).optional(),
  }),
  auth: z.object({
    userId: z.number().int().positive(),
  }),
});

/** Wiring dependencies for the give-clue controller. */
export type GiveClueControllerDeps = {
  giveClue: GiveClueService;
};

/**
 * `POST /api/games/:gameId/rounds/:roundNumber/clues` — codemaster gives
 * a clue.
 *
 * Body accepts `role` (single-device) or `playerId` (multi-device) for
 * actor identification — the service picks the right one based on the
 * loaded aggregate's game type. Maps service failure flags to HTTP
 * status codes.
 */
export const giveClueController =
  (logger: AppLogger) =>
  (deps: GiveClueControllerDeps) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const log = endpointLogger(logger, "POST /clues");
    try {
      const parsed = requestSchema.safeParse({
        params: req.params,
        body: req.body,
        auth: req.auth,
      });
      if (!parsed.success) {
        sendError(res, 400, "Invalid request");
        return;
      }

      const { params, body, auth } = parsed.data;
      const result = await deps.giveClue({
        gameId: params.gameId,
        roundNumber: params.roundNumber,
        userId: auth.userId,
        word: body.word,
        targetCardCount: body.targetCardCount,
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
