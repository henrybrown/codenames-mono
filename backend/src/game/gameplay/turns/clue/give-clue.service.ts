import type { TurnLoader } from "@backend/game/state/load-turn-aggregate";
import type { GameplayHandler } from "../../gameplay-actions";
import type { AppLogger } from "@backend/shared/logging";
import type { GameAggregate } from "@backend/game/state/types";
import type { GamePlayer } from "@backend/game/access";
import { GameEventsEmitter } from "@backend/shared/websocket";
import { GameplayValidationError } from "../../errors/gameplay.errors";
import { getCurrentTurn } from "@backend/game/state/helpers";
import {
  buildCompleteTurnData,
  type CompleteTurnData,
} from "../shared/present-turn";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Input parameters for giving a clue
 */
export type GiveClueInput = {
  gameState: GameAggregate;
  playerContext: GamePlayer;
  word: string;
  targetCardCount: number;
};

/**
 * Successful clue result with complete turn data
 */
export type GiveClueSuccess = {
  clue: {
    word: string;
    targetCardCount: number;
    createdAt: Date;
  };
  turn: CompleteTurnData;
};

/**
 * Clue giving error types
 */
export const GIVE_CLUE_ERROR = {
  INVALID_GAME_STATE: "invalid-game-state",
  INVALID_CLUE_WORD: "invalid-clue-word",
  ROUND_NOT_FOUND: "round-not-found",
} as const;

/**
 * Clue giving failure details
 */
export type GiveClueFailure =
  | {
      status: typeof GIVE_CLUE_ERROR.INVALID_GAME_STATE;
      currentState: string;
      validationErrors: unknown[];
    }
  | {
      status: typeof GIVE_CLUE_ERROR.INVALID_CLUE_WORD;
      word: string;
      reason: string;
    }
  | {
      status: typeof GIVE_CLUE_ERROR.ROUND_NOT_FOUND;
    };

/**
 * Combined result type for clue giving
 */
export type GiveClueResult =
  | { success: true; data: GiveClueSuccess }
  | { success: false; error: GiveClueFailure };

/**
 * Dependencies required by the give clue service
 */
export type GiveClueDependencies = {
  gameplayHandler: GameplayHandler;
  loadTurn: TurnLoader;
};

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Creates a service for handling clue giving with business rule validation
 */
export const giveClueService =
  (logger: AppLogger) =>
  (deps: GiveClueDependencies) =>
  async (input: GiveClueInput): Promise<GiveClueResult> => {
    const { gameState, playerContext, word, targetCardCount } = input;
    const log = logger.for({}).withMeta({ gameId: gameState.public_id }).create();
    log.info(`giveClue called: word=${word}, count=${targetCardCount}`);

    if (!gameState.currentRound) {
      log.warn(`giveClue failed: round not found`);
      return {
        success: false,
        error: { status: GIVE_CLUE_ERROR.ROUND_NOT_FOUND },
      };
    }

    try {
      const result = await deps.gameplayHandler(
        gameState,
        playerContext,
        async (ops) => ops.giveClue(word, targetCardCount),
      );

      const activeTurn = getCurrentTurn(result.state);
      if (!activeTurn) {
        log.error("giveClue: no active turn after handler");
        return {
          success: false,
          error: {
            status: GIVE_CLUE_ERROR.INVALID_GAME_STATE,
            currentState: result.state.status,
            validationErrors: [],
          },
        };
      }

      const turnData = await buildCompleteTurnData(
        deps.loadTurn,
        activeTurn.publicId,
        result.state.currentRound?.players ?? [],
      );
      if (!turnData) {
        log.error("giveClue: failed to load turn data");
        return {
          success: false,
          error: {
            status: GIVE_CLUE_ERROR.INVALID_GAME_STATE,
            currentState: result.state.status,
            validationErrors: [],
          },
        };
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
    } catch (error) {
      if (error instanceof GameplayValidationError) {
        if (error.message.startsWith("Cannot clue word:")) {
          log.warn(`giveClue failed: invalid clue word`);
          return {
            success: false,
            error: {
              status: GIVE_CLUE_ERROR.INVALID_CLUE_WORD,
              word,
              reason: error.message,
            },
          };
        }

        log.warn(`giveClue failed: invalid game state`);
        return {
          success: false,
          error: {
            status: GIVE_CLUE_ERROR.INVALID_GAME_STATE,
            currentState: gameState.status,
            validationErrors: [],
          },
        };
      }
      throw error;
    }
  };

export type GiveClueService = ReturnType<ReturnType<typeof giveClueService>>;
