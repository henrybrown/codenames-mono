/**
 * End Turn Service
 * Allows codebreakers to manually end their turn
 */

import type { GameplayHandler } from "../../gameplay-actions";
import type { AppLogger } from "@backend/shared/logging";
import type { GameAggregate } from "@backend/game/state/types";
import type { GamePlayer } from "@backend/game/access";
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
  | { success: false; message: string };

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
      return { success: false, message: "No active turn" };
    }

    // ops.endTurn returns a Result; validation failures surface as
    // { ok: false, message } instead of throwing. Genuine internal
    // errors still throw and propagate to the global error middleware.
    const result = await deps.gameplayHandler(
      gameState,
      playerContext,
      async (ops) => ops.endTurn(currentTurn._id),
    );

    if (!result.ok) {
      log.warn(`endTurn failed: ${result.message}`);
      return { success: false, message: result.message };
    }

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
  };
