import type { TurnLoader } from "@backend/game/state/load-turn-aggregate";
import type { GameplayHandler } from "../../gameplay-actions";
import type { AppLogger } from "@backend/shared/logging";
import type { GameAggregate } from "@backend/game/state/types";
import type { GamePlayer } from "@backend/game/access";
import { GameEventsEmitter } from "@backend/shared/websocket";
import { getCurrentTurn } from "@backend/game/state/helpers";
import {
  buildCompleteTurnData,
  type CompleteTurnData,
} from "../shared/present-turn";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type GiveClueInput = {
  gameState: GameAggregate;
  playerContext: GamePlayer;
  word: string;
  targetCardCount: number;
};

export type GiveClueSuccess = {
  clue: {
    word: string;
    targetCardCount: number;
    createdAt: Date;
  };
  turn: CompleteTurnData;
};

export type GiveClueResult =
  | { success: true; data: GiveClueSuccess }
  | { success: false; message: string };

export type GiveClueDependencies = {
  gameplayHandler: GameplayHandler;
  loadTurn: TurnLoader;
};

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

export const giveClueService =
  (logger: AppLogger) =>
  (deps: GiveClueDependencies) =>
  async (input: GiveClueInput): Promise<GiveClueResult> => {
    const { gameState, playerContext, word, targetCardCount } = input;
    const log = logger.for({}).withMeta({ gameId: gameState.public_id }).create();
    log.info(`giveClue called: word=${word}, count=${targetCardCount}`);

    if (!gameState.currentRound) {
      log.warn("giveClue failed: no current round");
      return { success: false, message: "No current round" };
    }

    const result = await deps.gameplayHandler(
      gameState,
      playerContext,
      async (ops) => ops.giveClue(word, targetCardCount),
    );

    if (!result.ok) {
      log.warn(`giveClue failed: ${result.message}`);
      return { success: false, message: result.message };
    }

    const activeTurn = getCurrentTurn(result.state);
    if (!activeTurn) {
      // Shouldn't happen — successful giveClue leaves an active turn.
      log.error("giveClue: no active turn after successful handler");
      return { success: false, message: "Internal state error" };
    }

    const turnData = await buildCompleteTurnData(
      deps.loadTurn,
      activeTurn.publicId,
      result.state.currentRound?.players ?? [],
    );
    if (!turnData) {
      log.error("giveClue: failed to load turn data");
      return { success: false, message: "Failed to load turn data" };
    }

    GameEventsEmitter.clueGiven(
      result.state.public_id,
      result.state.currentRound!.number,
      activeTurn.publicId,
      playerContext.publicId,
    );

    log.info(`giveClue success: word=${word}, count=${targetCardCount}`);
    return {
      success: true,
      data: {
        clue: {
          word: result.clue.word,
          targetCardCount: result.clue.number,
          createdAt: result.clue.createdAt,
        },
        turn: turnData,
      },
    };
  };

export type GiveClueService = ReturnType<ReturnType<typeof giveClueService>>;
