/**
 * End Turn Controller
 * API endpoint for codebreakers to end their turn
 */

import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { EndTurnService } from "./end-turn.service";
import type { AppLogger } from "@backend/shared/logging";
import type { ResolveGameplayContext } from "../shared/resolve-gameplay-context";
import { contextErrorToHttp } from "../shared/resolve-gameplay-context";
import type { GameDataLoader } from "@backend/game/gameplay/state/load-game-aggregate";
import { PLAYER_ROLE, GAME_TYPE } from "@codenames/shared/types";
import { z } from "zod";

const paramsSchema = z.object({
  gameId: z.string().min(1),
  roundNumber: z.string().transform(Number).refine((n) => n > 0),
});

const authSchema = z.object({
  userId: z.number().int().positive(),
});

const singleDeviceBody = z.object({
  role: z.enum([PLAYER_ROLE.CODEMASTER, PLAYER_ROLE.CODEBREAKER]),
});

const multiDeviceBody = z.object({
  playerId: z.string().min(1),
});

export type EndTurnControllerDeps = {
  endTurn: EndTurnService;
  resolveContext: ResolveGameplayContext;
  loadGameData: GameDataLoader;
};

export const createEndTurnController = (logger: AppLogger) => (deps: EndTurnControllerDeps) => {
  return async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const log = logger.for({}).withMeta({ endpoint: "POST /end-turn" }).create();

    try {
      const paramsResult = paramsSchema.safeParse(req.params);
      const authResult = authSchema.safeParse(req.auth);
      if (!paramsResult.success || !authResult.success) {
        res.status(400).json({ success: false, error: "Invalid request parameters" });
        return;
      }
      const { gameId, roundNumber } = paramsResult.data;
      const { userId } = authResult.data;

      const rawGameState = await deps.loadGameData(gameId);
      if (!rawGameState) {
        res.status(404).json({ success: false, error: "Game not found" });
        return;
      }

      if (rawGameState.currentRound && rawGameState.currentRound.number !== roundNumber) {
        res.status(409).json({ success: false, error: "Round number mismatch" });
        return;
      }

      let contextResult;
      if (rawGameState.game_type === GAME_TYPE.SINGLE_DEVICE) {
        const bodyResult = singleDeviceBody.safeParse(req.body);
        if (!bodyResult.success) {
          res.status(400).json({ success: false, error: "Invalid request body" });
          return;
        }
        contextResult = await deps.resolveContext.fromRole(gameId, userId, bodyResult.data.role);
      } else {
        const bodyResult = multiDeviceBody.safeParse(req.body);
        if (!bodyResult.success) {
          res.status(400).json({ success: false, error: "playerId is required" });
          return;
        }
        contextResult = await deps.resolveContext.fromPlayerId(gameId, userId, bodyResult.data.playerId);
      }

      if (!contextResult.success) {
        const httpError = contextErrorToHttp(contextResult.error);
        res.status(httpError.status).json({ success: false, ...httpError.body });
        return;
      }

      const result = await deps.endTurn({ gameState: contextResult.gameState });

      if (!result.success) {
        log.warn(`Response: ${result.error}`);
        res.status(400).json(result);
        return;
      }

      log.info("Response: 200 OK");
      res.status(200).json(result);
    } catch (error) {
      logger.error("Error in endTurn controller", { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  };
};
