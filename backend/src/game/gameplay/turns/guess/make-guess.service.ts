import type { TurnLoader } from "@backend/game/state/load-turn";
import type { GameplayHandler } from "../../gameplay-actions";
import type { AppLogger } from "@backend/shared/logging";
import { CODEBREAKER_OUTCOME } from "@codenames/shared/types";
import {
  getCurrentTurnOrThrow,
  getOtherTeamId,
  computeTurnPhase,
} from "@backend/game/state/helpers";
import { TurnPhase, GameAggregate, Player } from "@backend/game/state/types";
import type { GamePlayer } from "@backend/game/access";
import { winningConditions } from "./make-guess.rules";
import { GameEventsEmitter } from "@backend/shared/websocket";
import { GameplayValidationError } from "../../errors/gameplay.errors";

/**
 * Input parameters for making a guess
 */
export type MakeGuessInput = {
  gameState: GameAggregate;
  playerContext: GamePlayer;
  cardWord: string;
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
      validationErrors: any[];
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

/**
 * Creates the make guess service
 */
export const makeGuessService = (logger: AppLogger) => (dependencies: MakeGuessDependencies) => {
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

  return async (input: MakeGuessInput): Promise<MakeGuessResult> => {
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
      // Execute within transaction — ops are game-scoped, no state passing needed
      const operationResult = await dependencies.gameplayHandler(gameState, async (ops) => {
        const { outcome, state, ...guessResult } = await ops.makeGuess(cardWord);

        switch (outcome) {
          case CODEBREAKER_OUTCOME.CORRECT_TEAM_CARD: {
            const otherTeamId = getOtherTeamId(state, guessResult.turn._teamId);
            const roundWinner = winningConditions.checkRoundWinner(
              state.currentRound!.cards,
              guessResult.turn._teamId,
              otherTeamId,
            );

            if (roundWinner) {
              const afterTurnEnd = await ops.endTurn(guessResult.turn._id);
              const afterRoundEnd = await ops.endRound(afterTurnEnd.currentRound!._id, roundWinner);
              const gameWinner = winningConditions.checkGameWinner(
                afterRoundEnd.historicalRounds,
                afterRoundEnd.game_format,
              );
              if (gameWinner) await ops.endGame(gameWinner);
            } else if (guessResult.turn.guessesRemaining === 0) {
              await ops.endTurn(guessResult.turn._id);
            }
            break;
          }
          case CODEBREAKER_OUTCOME.OTHER_TEAM_CARD: {
            const afterTurnEnd = await ops.endTurn(guessResult.turn._id);
            const otherTeamId = getOtherTeamId(afterTurnEnd, guessResult.turn._teamId);
            const roundWinner = winningConditions.checkRoundWinner(
              afterTurnEnd.currentRound!.cards,
              guessResult.turn._teamId,
              otherTeamId,
            );

            if (roundWinner) {
              const afterRoundEnd = await ops.endRound(afterTurnEnd.currentRound!._id, roundWinner);
              const gameWinner = winningConditions.checkGameWinner(
                afterRoundEnd.historicalRounds,
                afterRoundEnd.game_format,
              );
              if (gameWinner) await ops.endGame(gameWinner);
            }
            break;
          }
          case CODEBREAKER_OUTCOME.BYSTANDER_CARD: {
            await ops.endTurn(guessResult.turn._id);
            break;
          }
          case CODEBREAKER_OUTCOME.ASSASSIN_CARD: {
            const afterTurnEnd = await ops.endTurn(guessResult.turn._id);
            const otherTeamId = getOtherTeamId(afterTurnEnd, guessResult.turn._teamId);
            const afterRoundEnd = await ops.endRound(afterTurnEnd.currentRound!._id, otherTeamId);
            const gameWinner = winningConditions.checkGameWinner(
              afterRoundEnd.historicalRounds,
              afterRoundEnd.game_format,
            );
            if (gameWinner) await ops.endGame(gameWinner);
            break;
          }
        }

        return { guessResult: { ...guessResult, outcome } };
      });

      const currentTurn = getCurrentTurnOrThrow(gameState);
      const roundPlayers = gameState.currentRound?.players ?? [];
      const completeTurnData = await getCompleteTurnData(currentTurn.publicId, roundPlayers);

      // Emit WebSocket events
      GameEventsEmitter.guessMade(
        gameState.public_id,
        gameState.currentRound!.number,
        currentTurn.publicId,
        playerContext.publicId,
      );

      if (completeTurnData.status === "COMPLETED") {
        GameEventsEmitter.turnEnded(gameState.public_id, gameState.currentRound!.number, currentTurn.publicId);
      }

      log.info(`makeGuess success: cardWord=${cardWord}, outcome=${operationResult.guessResult.outcome}`);
      return {
        success: true,
        data: {
          guess: {
            cardWord,
            outcome: operationResult.guessResult.outcome,
            createdAt: operationResult.guessResult.createdAt,
          },
          turn: completeTurnData,
        },
      };
    } catch (error) {
      if (error instanceof GameplayValidationError) {
        // Check for card validation errors
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
};

export type MakeGuessService = ReturnType<ReturnType<typeof makeGuessService>>;
