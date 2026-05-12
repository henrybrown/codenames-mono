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
 * Input parameters for making a guess
 */
export type MakeGuessInput = {
  gameState: GameAggregate;
  playerContext: GamePlayer;
  cardWord: string;
};

/**
 * Successful guess result with complete turn data
 */
export type MakeGuessSuccess = {
  guess: {
    cardWord: string;
    outcome: string;
    createdAt: Date;
  };
  turn: CompleteTurnData;
};

/**
 * Guess error types
 */
export const MAKE_GUESS_ERROR = {
  INVALID_GAME_STATE: "invalid-game-state",
  INVALID_CARD: "invalid-card",
  ROUND_NOT_FOUND: "round-not-found",
  ROUND_NOT_CURRENT: "round-not-current",
} as const;

/**
 * Guess failure details
 */
export type MakeGuessFailure =
  | {
      status: typeof MAKE_GUESS_ERROR.INVALID_GAME_STATE;
      currentState: string;
      validationErrors: unknown[];
    }
  | {
      status: typeof MAKE_GUESS_ERROR.INVALID_CARD;
      cardWord: string;
      reason: string;
    }
  | {
      status: typeof MAKE_GUESS_ERROR.ROUND_NOT_FOUND;
      roundNumber: number;
    }
  | {
      status: typeof MAKE_GUESS_ERROR.ROUND_NOT_CURRENT;
      requestedRound: number;
      currentRound: number;
    };

/**
 * Combined result type for guess making
 */
export type MakeGuessResult =
  | { success: true; data: MakeGuessSuccess }
  | { success: false; error: MakeGuessFailure };

/**
 * Dependencies required by the make guess service
 */
export type MakeGuessDependencies = {
  gameplayHandler: GameplayHandler;
  loadTurn: TurnLoader;
};

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Defensive fallback for the rare case where the round/game ended and
 * the turn we'd shape data for can't be loaded fresh. Builds a minimal
 * COMPLETED turn shape so the response stays well-formed.
 */
function buildMinimalCompletedTurnShape(
  guessTurn: {
    _teamId: number;
    guessesRemaining: number;
    createdAt: Date;
    completedAt?: Date | null;
  },
): CompleteTurnData {
  return {
    id: "",
    teamName: "",
    status: "COMPLETED",
    guessesRemaining: guessTurn.guessesRemaining,
    createdAt: guessTurn.createdAt,
    completedAt: guessTurn.completedAt ?? new Date(),
    clue: undefined,
    hasGuesses: true,
    prevGuesses: [],
    active: null,
  };
}

/**
 * Creates the make guess service
 */
export const makeGuessService =
  (logger: AppLogger) =>
  (deps: MakeGuessDependencies) =>
  async (input: MakeGuessInput): Promise<MakeGuessResult> => {
    const { gameState, playerContext, cardWord } = input;
    const log = logger.for({}).withMeta({ gameId: gameState.public_id }).create();
    log.info(`makeGuess called: cardWord=${cardWord}`);

    if (!gameState.currentRound) {
      log.warn(`makeGuess failed: round not found`);
      return {
        success: false,
        error: { status: MAKE_GUESS_ERROR.ROUND_NOT_FOUND, roundNumber: 0 },
      };
    }

    try {
      const result = await deps.gameplayHandler(
        gameState,
        playerContext,
        async (ops) => ops.makeGuess(cardWord),
      );

      // The post-guess turn — may have been ended by applyGuessOutcome.
      // We respond with whatever the final state's "current" turn is, since
      // the round may have advanced. If the round ended, currentRound here
      // is null (and turn data load fails); we surface the guess result
      // anyway with a minimal turn shape derived from the guess result.
      const responseTurnPublicId =
        getCurrentTurn(result.state)?.publicId
        ?? gameState.currentRound.turns.find((t) => t._id === result.guess.turn._id)?.publicId
        ?? "";

      const turnData = responseTurnPublicId
        ? await buildCompleteTurnData(
            deps.loadTurn,
            responseTurnPublicId,
            result.state.currentRound?.players
              ?? gameState.currentRound.players
              ?? [],
          )
        : null;

      // WebSocket emits based on aftermath
      GameEventsEmitter.guessMade(
        gameState.public_id,
        gameState.currentRound.number,
        responseTurnPublicId,
        playerContext.publicId,
      );

      if (result.aftermath.turnEnded && responseTurnPublicId) {
        GameEventsEmitter.turnEnded(
          gameState.public_id,
          gameState.currentRound.number,
          responseTurnPublicId,
        );
      }

      log.info(
        `makeGuess success: cardWord=${cardWord}, outcome=${result.guess.outcome}, turnEnded=${result.aftermath.turnEnded}, roundEnded=${!!result.aftermath.roundEnded}, gameEnded=${!!result.aftermath.gameEnded}`,
      );
      return {
        success: true,
        data: {
          guess: {
            cardWord,
            outcome: result.guess.outcome,
            createdAt: result.guess.createdAt,
          },
          turn: turnData ?? buildMinimalCompletedTurnShape(result.guess.turn),
        },
      };
    } catch (error) {
      if (error instanceof GameplayValidationError) {
        if (error.message.includes("guess card:")) {
          log.warn(`makeGuess failed: invalid card`);
          return {
            success: false,
            error: {
              status: MAKE_GUESS_ERROR.INVALID_CARD,
              cardWord,
              reason: error.message,
            },
          };
        }

        log.warn(`makeGuess failed: invalid game state (${gameState.status})`);
        return {
          success: false,
          error: {
            status: MAKE_GUESS_ERROR.INVALID_GAME_STATE,
            currentState: gameState.status,
            validationErrors: [],
          },
        };
      }
      throw error;
    }
  };

export type MakeGuessService = ReturnType<ReturnType<typeof makeGuessService>>;
