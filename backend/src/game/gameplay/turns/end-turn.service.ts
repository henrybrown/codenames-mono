/**
 * End Turn Service
 * Allows codebreakers to manually end their turn
 */

import type { GameplayHandler } from "../gameplay-actions";
import type { AppLogger } from "@backend/shared/logging";
import type { GameAggregate } from "@backend/game/state/types";
import type { GamePlayer } from "@backend/game/access";
import { GameplayValidationError } from "../errors/gameplay.errors";
import { GameEventsEmitter } from "@backend/shared/websocket";
import { getCurrentTurn } from "@backend/game/state/helpers";

export type EndTurnInput = {
  gameState: GameAggregate;
  playerContext: GamePlayer;
};

export type EndTurnResult =
  | {
      success: true;
      data: {
        turn: {
          id: string;
          teamName: string;
          status: string;
          completedAt: Date;
        };
      };
    }
  | { success: false; error: string };

export type EndTurnService = (input: EndTurnInput) => Promise<EndTurnResult>;

export type EndTurnDependencies = {
  gameplayHandler: GameplayHandler;
};

export const createEndTurnService =
  (logger: AppLogger) =>
  (deps: EndTurnDependencies): EndTurnService =>
  async (input) => {
    const { gameState, playerContext } = input;
    const log = logger.for({}).withMeta({ gameId: gameState.public_id }).create();
    log.info(`endTurn called`);

    const currentTurn = getCurrentTurn(gameState);
    if (!currentTurn) {
      log.warn("endTurn failed: no active turn");
      return { success: false, error: "No active turn" };
    }

    try {
      await deps.gameplayHandler(gameState, playerContext, async (ops) => {
        await ops.endTurn(currentTurn._id);
      });

      GameEventsEmitter.turnEnded(
        gameState.public_id,
        gameState.currentRound!.number,
        currentTurn.publicId,
      );

      log.info(`endTurn success: turnId=${currentTurn.publicId}`);
      return {
        success: true,
        data: {
          turn: {
            id: currentTurn.publicId,
            teamName: currentTurn.teamName,
            status: "COMPLETED",
            completedAt: new Date(),
          },
        },
      };
    } catch (error) {
      if (error instanceof GameplayValidationError) {
        log.warn(`endTurn failed: ${error.message}`);
        return { success: false, error: error.message };
      }
      log.error("endTurn failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: "Failed to end turn" };
    }
  };
