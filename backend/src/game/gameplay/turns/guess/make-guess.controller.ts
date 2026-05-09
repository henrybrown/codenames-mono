import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { MakeGuessService } from "./make-guess.service";
import type { AppLogger } from "@backend/shared/logging";
import type { ResolveGameplayContext } from "../../shared/resolve-gameplay-context";
import { contextErrorToHttp } from "../../shared/resolve-gameplay-context";
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
  cardWord: z.string().min(1).max(50),
});

const multiDeviceBody = z.object({
  playerId: z.string().min(1),
  cardWord: z.string().min(1).max(50),
});

export type Dependencies = {
  makeGuess: MakeGuessService;
  resolveContext: ResolveGameplayContext;
  loadGameData: GameDataLoader;
};

export const makeGuessController = (logger: AppLogger) => (deps: Dependencies) => {
  return async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const log = logger.for({}).withMeta({ endpoint: "POST /guesses" }).create();

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
        res.status(409).json({ success: false, error: "Round is not current" });
        return;
      }

      let contextResult;
      let cardWord: string;

      if (rawGameState.game_type === GAME_TYPE.SINGLE_DEVICE) {
        const bodyResult = singleDeviceBody.safeParse(req.body);
        if (!bodyResult.success) {
          res.status(400).json({ success: false, error: "Invalid request body" });
          return;
        }
        cardWord = bodyResult.data.cardWord;
        contextResult = await deps.resolveContext.fromRole(gameId, userId, bodyResult.data.role);
      } else {
        const bodyResult = multiDeviceBody.safeParse(req.body);
        if (!bodyResult.success) {
          res.status(400).json({ success: false, error: "Invalid request body" });
          return;
        }
        cardWord = bodyResult.data.cardWord;
        contextResult = await deps.resolveContext.fromPlayerId(gameId, userId, bodyResult.data.playerId);
      }

      if (!contextResult.success) {
        const httpError = contextErrorToHttp(contextResult.error);
        res.status(httpError.status).json({ success: false, ...httpError.body });
        return;
      }

      const result = await deps.makeGuess({
        gameState: contextResult.gameState,
        cardWord,
      });

      if (!result.success) {
        log.warn(`Response: ${result.error.status}`);
        switch (result.error.status) {
          case "round-not-found":
            res.status(404).json({ success: false, error: "Round not found" });
            return;
          case "round-not-current":
            res.status(409).json({ success: false, error: "Round is not current" });
            return;
          case "invalid-game-state":
            res.status(409).json({ success: false, error: "Invalid game state for making guess" });
            return;
          case "invalid-card":
            res.status(400).json({ success: false, error: "Invalid card selection" });
            return;
          default:
            res.status(500).json({ success: false, error: "Unknown error" });
            return;
        }
      }

      log.info(`Response: 200 OK, outcome=${result.data.guess.outcome}`);
      res.status(200).json({ success: true, data: result.data });
    } catch (error) {
      logger.error("Error in makeGuess controller", { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  };
};
