import type { TurnLoader } from "@backend/game/state/load-turn";
import type { GameplayHandler } from "../../gameplay-actions";
import type { AppLogger } from "@backend/shared/logging";
import { computeTurnPhase } from "@backend/game/state/helpers";
import { TurnPhase, GameAggregate, Player } from "@backend/game/state/types";
import type { GamePlayer } from "@backend/game/access";
import { GameEventsEmitter } from "@backend/shared/websocket";
import { GameplayValidationError } from "../../errors/gameplay.errors";

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
 * Complete turn data that matches frontend TurnData interface
 */
export type CompleteTurnData = {
  id: string;
  teamName: string;
  status: "ACTIVE" | "COMPLETED";
  guessesRemaining: number;
  createdAt: Date;
  completedAt?: Date | null;
  clue?: {
    word: string;
    number: number;
    createdAt: Date;
  };
  hasGuesses: boolean;
  lastGuess?: {
    cardWord: string;
    playerName: string;
    outcome: string | null;
    createdAt: Date;
  };
  prevGuesses: {
    cardWord: string;
    playerName: string;
    outcome: string | null;
    createdAt: Date;
  }[];
  active: TurnPhase | null;
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
      validationErrors: any[];
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

/**
 * Creates a service for handling clue giving with business rule validation
 */
export const giveClueService = (logger: AppLogger) => (dependencies: GiveClueDependencies) => {
  /**
   * Helper to get complete turn data for API response
   */
  const getCompleteTurnData = async (
    turnPublicId: string,
    players: Pick<Player, "publicName" | "teamName" | "_teamId" | "role" | "isAi">[],
  ): Promise<CompleteTurnData> => {
    const turnData = await dependencies.loadTurn(turnPublicId);
    if (!turnData) {
      throw new Error(`Failed to fetch turn data for ${turnPublicId}`);
    }

    const turnForPhase = {
      status: turnData.status,
      _teamId: players.find((p) => p.teamName === turnData.teamName)?._teamId ?? 0,
      clue: turnData.clue,
    };

    return {
      id: turnData.publicId,
      teamName: turnData.teamName,
      status: turnData.status,
      guessesRemaining: turnData.guessesRemaining,
      createdAt: turnData.createdAt,
      completedAt: turnData.completedAt,
      clue: turnData.clue,
      hasGuesses: turnData.hasGuesses,
      lastGuess: turnData.lastGuess,
      prevGuesses: turnData.prevGuesses,
      active: computeTurnPhase(turnForPhase, players),
    };
  };

  return async (input: GiveClueInput): Promise<GiveClueResult> => {
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
      const operationResult = await dependencies.gameplayHandler(gameState, async (ops) => {
        return await ops.giveClue(word, targetCardCount);
      });

      // Fetch complete turn data after transaction completes
      const currentTurn = gameState.currentRound.turns?.find((t) => t.status === "ACTIVE");
      const roundPlayers = gameState.currentRound?.players ?? [];
      const completeTurnData = await getCompleteTurnData(
        currentTurn?.publicId ?? "",
        roundPlayers,
      );

      // Emit WebSocket event
      GameEventsEmitter.clueGiven(
        gameState.public_id,
        gameState.currentRound.number,
        currentTurn?.publicId ?? "",
        playerContext.publicId,
      );

      log.info(`giveClue success: word=${word}, count=${targetCardCount}`);
      return {
        success: true,
        data: {
          clue: {
            word: operationResult.clue.word,
            targetCardCount: operationResult.clue.number,
            createdAt: operationResult.clue.createdAt,
          },
          turn: completeTurnData,
        },
      };
    } catch (error) {
      if (error instanceof GameplayValidationError) {
        // Check if it's a clue word validation error
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
};

export type GiveClueService = ReturnType<ReturnType<typeof giveClueService>>;
