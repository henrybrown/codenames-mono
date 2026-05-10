/**
 * End Turn Service
 * Allows codebreakers to manually end their turn
 */

import type { GameplayHandler } from "../gameplay-actions";
import type { AppLogger } from "@backend/shared/logging";
import { GameplayValidationError } from "../errors/gameplay.errors";
import { GameEventsEmitter } from "@backend/shared/websocket";
import type { GameAggregate } from "@backend/game/gameplay/state/gameplay-state.types";
import type { GamePlayer } from "@backend/game/access";

export type EndTurnInput = {
  gameState: GameAggregate;
  playerContext: GamePlayer;
};

export type EndTurnService = (input: EndTurnInput) => Promise<EndTurnResult>;

export type EndTurnResult =
  | { success: true; data: { turn: { id: string; teamName: string; status: string; completedAt: Date } } }
  | { success: false; error: string };

export type EndTurnDependencies = {
  gameplayHandler: GameplayHandler;
};

export const createEndTurnService = (logger: AppLogger) => (
  deps: EndTurnDependencies
): EndTurnService => {
  const { gameplayHandler } = deps;

  return async (input) => {
    const { gameState, playerContext } = input;
    const log = logger.for({}).withMeta({ gameId: gameState.public_id }).create();
    log.info(`endTurn called`);

    try {
      const currentRound = gameState.currentRound;
      if (!currentRound) {
        log.warn("endTurn failed: no active round");
        return { success: false, error: "No active round" };
      }

      const currentTurn = currentRound.turns[currentRound.turns.length - 1];
      if (!currentTurn) {
        log.warn("endTurn failed: no active turn");
        return { success: false, error: "No active turn" };
      }

      if (currentTurn.status === "COMPLETED") {
        log.warn("endTurn failed: turn already completed");
        return { success: false, error: "Turn already completed" };
      }

      if (playerContext.role !== "CODEBREAKER") {
        log.warn("endTurn failed: only codebreakers can end turn");
        return { success: false, error: "Only codebreakers can end turn" };
      }

      // For non-AI players, verify it's their team's turn
      const fullPlayer = currentRound.players.find(
        p => p.publicId === playerContext.publicId
      );
      if (!fullPlayer?.isAi && playerContext.teamName !== currentTurn.teamName) {
        log.warn("endTurn failed: not your team's turn");
        return { success: false, error: "Not your team's turn" };
      }

      const turnWithInternalId = currentRound.turns.find(t => t.publicId === currentTurn.publicId);
      if (!turnWithInternalId || !turnWithInternalId._id) {
        log.warn("endTurn failed: turn not found");
        return { success: false, error: "Turn not found" };
      }

      // End the current turn. The next turn is started explicitly by the
      // frontend (via the outcome panel countdown / NextTurnTrigger) — we
      // never auto-start here.
      await gameplayHandler(gameState, async (ops) => {
        await ops.endTurn(turnWithInternalId._id);
      });

      GameEventsEmitter.turnEnded(gameState.public_id, currentRound.number, currentTurn.publicId);

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
      log.error("Failed to end turn", { error: error instanceof Error ? error.message : String(error) });

      if (error instanceof GameplayValidationError) {
        return { success: false, error: error.message };
      }

      return { success: false, error: "Failed to end turn" };
    }
  };
};
