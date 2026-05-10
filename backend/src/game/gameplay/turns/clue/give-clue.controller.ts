import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { GiveClueService } from "./give-clue.service";
import type { AppLogger } from "@backend/shared/logging";
import type { ResolveGameplayContext } from "../../shared/resolve-gameplay-context";
import { contextErrorToHttp } from "../../shared/resolve-gameplay-context";
import type { GameAggregateLoader } from "@backend/game/gameplay/state/load-game-aggregate";
import { PLAYER_ROLE, GAME_TYPE } from "@codenames/shared/types";
import { z } from "zod";

const paramsSchema = z.object({
  gameId: z.string().min(1),
  roundNumber: z.string().transform(Number).refine((n) => n > 0),
});

const authSchema = z.object({
  userId: z.number().int().positive(),
});

const clueFields = z.object({
  word: z.string().min(1).max(50),
  targetCardCount: z.number().int().min(1).max(25),
});

const singleDeviceBody = clueFields.extend({
  role: z.enum([PLAYER_ROLE.CODEMASTER, PLAYER_ROLE.CODEBREAKER]),
});

const multiDeviceBody = clueFields.extend({
  playerId: z.string().min(1),
});

export type Dependencies = {
  giveClue: GiveClueService;
  resolveContext: ResolveGameplayContext;
  loadGameAggregate: GameAggregateLoader;
};

export const giveClueController = (logger: AppLogger) => (deps: Dependencies) => {
  return async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const log = logger.for({}).withMeta({ endpoint: "POST /clues" }).create();

    try {
      // Validate params + auth
      const paramsResult = paramsSchema.safeParse(req.params);
      const authResult = authSchema.safeParse(req.auth);
      if (!paramsResult.success || !authResult.success) {
        res.status(400).json({ success: false, error: "Invalid request parameters" });
        return;
      }
      const { gameId, roundNumber } = paramsResult.data;
      const { userId } = authResult.data;

      // Load game to determine type
      const rawGameState = await deps.loadGameAggregate(gameId);
      if (!rawGameState) {
        res.status(404).json({ success: false, error: "Game not found" });
        return;
      }

      // Validate round number
      if (rawGameState.currentRound && rawGameState.currentRound.number !== roundNumber) {
        res.status(409).json({ success: false, error: "Round is not current" });
        return;
      }

      // Branch on game type for body validation + context resolution
      let contextResult;
      let word: string;
      let targetCardCount: number;

      if (rawGameState.game_type === GAME_TYPE.SINGLE_DEVICE) {
        const bodyResult = singleDeviceBody.safeParse(req.body);
        if (!bodyResult.success) {
          res.status(400).json({ success: false, error: "Invalid request body" });
          return;
        }
        word = bodyResult.data.word;
        targetCardCount = bodyResult.data.targetCardCount;
        contextResult = await deps.resolveContext.fromRole(gameId, userId, bodyResult.data.role);
      } else {
        const bodyResult = multiDeviceBody.safeParse(req.body);
        if (!bodyResult.success) {
          res.status(400).json({ success: false, error: "Invalid request body" });
          return;
        }
        word = bodyResult.data.word;
        targetCardCount = bodyResult.data.targetCardCount;
        contextResult = await deps.resolveContext.fromPlayerId(gameId, userId, bodyResult.data.playerId);
      }

      if (!contextResult.success) {
        const httpError = contextErrorToHttp(contextResult.error);
        res.status(httpError.status).json({ success: false, ...httpError.body });
        return;
      }

      // Call service with resolved game state
      const result = await deps.giveClue({
        gameState: contextResult.gameState,
        word,
        targetCardCount,
      });

      if (!result.success) {
        log.warn(`Response: ${result.error.status}`);
        switch (result.error.status) {
          case "round-not-found":
            res.status(404).json({ success: false, error: "Round not found" });
            return;
          case "invalid-game-state":
            res.status(409).json({ success: false, error: "Invalid game state for giving clue" });
            return;
          case "invalid-clue-word":
            res.status(400).json({ success: false, error: "Invalid clue word" });
            return;
          default:
            res.status(500).json({ success: false, error: "Unknown error" });
            return;
        }
      }

      log.info(`Response: 200 OK, word=${result.data.clue.word}`);
      res.status(200).json({ success: true, data: result.data });
    } catch (error) {
      logger.error("Error in giveClue controller", { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  };
};
