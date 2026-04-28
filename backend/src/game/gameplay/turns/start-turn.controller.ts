/**
 * Start Turn Controller
 * API endpoint to manually start the next turn.
 *
 * Note: this endpoint is called between turns (no active turn exists yet),
 * so it does NOT resolve a player-specific context. It only verifies that
 * the requesting user is a player in the game.
 */

import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { StartTurnService } from "./start-turn.service";
import type { AppLogger } from "@backend/shared/logging";
import type { ResolveGameplayContext } from "../shared/resolve-gameplay-context";
import { contextErrorToHttp } from "../shared/resolve-gameplay-context";
import type { GameDataLoader } from "@backend/game/gameplay/state/game-data-loader";
import { z } from "zod";

const paramsSchema = z.object({
  gameId: z.string().min(1),
  roundNumber: z.string().transform(Number).refine((n) => n > 0),
});

const authSchema = z.object({
  userId: z.number().int().positive(),
});

export type StartTurnControllerDeps = {
  startTurn: StartTurnService;
  resolveContext: ResolveGameplayContext;
  loadGameData: GameDataLoader;
};

export const createStartTurnController =
  (logger: AppLogger) => (deps: StartTurnControllerDeps) => {
    return async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
      const log = logger.for({}).withMeta({ endpoint: "POST /turns" }).create();

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

        const contextResult = await deps.resolveContext.fromUser(gameId, userId);

        if (!contextResult.success) {
          const httpError = contextErrorToHttp(contextResult.error);
          res.status(httpError.status).json({ success: false, ...httpError.body });
          return;
        }

        const result = await deps.startTurn({ gameState: contextResult.gameState });

        if (!result.success) {
          log.warn(`Response: ${result.error}`);
          res.status(400).json(result);
          return;
        }

        log.info("Response: 201 Created");
        res.status(201).json(result);
      } catch (error) {
        logger.error("Error in startTurn controller", { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ success: false, error: "Internal server error" });
      }
    };
  };
