import type { LobbyStateProvider } from "../state";
import type { LobbyValidationError } from "../state/lobby-state.validation";
import type { TransactionalHandler } from "@backend/shared/data-access/transaction-handler";
import type { LobbyOperations } from "../lobby-actions";

import { validate as checkRoundStartRules } from "./start-round.rules";

/**
 * Input parameters for starting a round
 */
export type StartRoundInput = {
  gameId: string;
  roundNumber: number;
  userId: number;
};

/**
 * Successful round start result
 */
export type StartRoundSuccess = {
  roundNumber: number;
  status: string;
};

/**
 * Round start error types
 */
export const START_ROUND_ERROR = {
  INVALID_GAME_STATE: "invalid-game-state",
  GAME_NOT_FOUND: "game-not-found",
  USER_NOT_PLAYER: "user-not-player",
  ROUND_NOT_FOUND: "round-not-found",
} as const;

/**
 * Round start failure details
 */
export type StartRoundFailure =
  | {
      status: typeof START_ROUND_ERROR.INVALID_GAME_STATE;
      currentState: string;
      validationErrors: LobbyValidationError[];
    }
  | {
      status: typeof START_ROUND_ERROR.GAME_NOT_FOUND;
      gameId: string;
    }
  | {
      status: typeof START_ROUND_ERROR.USER_NOT_PLAYER;
      gameId: string;
      userId: number;
    }
  | {
      status: typeof START_ROUND_ERROR.ROUND_NOT_FOUND;
      roundNumber: number;
    };

/**
 * Combined result type for round start
 */
export type StartRoundResult =
  | { success: true; data: StartRoundSuccess }
  | { success: false; error: StartRoundFailure };

/**
 * Dependencies required by the start round service
 */
export type StartRoundDependencies = {
  getLobbyState: LobbyStateProvider;
  lobbyHandler: TransactionalHandler<LobbyOperations>;
};

/**
 * Creates a service for handling round start with business rule validation
 *
 * @param dependencies - Required external dependencies
 * @returns Service function for starting rounds
 */
export const startRoundService = (dependencies: StartRoundDependencies) => {
  return async (input: StartRoundInput): Promise<StartRoundResult> => {
    const lobbyState = await dependencies.getLobbyState(input.gameId, input.userId);

    if (!lobbyState) {
      return {
        success: false,
        error: {
          status: START_ROUND_ERROR.GAME_NOT_FOUND,
          gameId: input.gameId,
        },
      };
    }

    // Check if user can modify game (basic permission check)
    if (!lobbyState.userContext.canModifyGame) {
      return {
        success: false,
        error: {
          status: START_ROUND_ERROR.USER_NOT_PLAYER,
          gameId: input.gameId,
          userId: input.userId,
        },
      };
    }

    const gameData = lobbyState;

    if (!gameData.currentRound) {
      return {
        success: false,
        error: {
          status: START_ROUND_ERROR.ROUND_NOT_FOUND,
          roundNumber: input.roundNumber,
        },
      };
    }

    if (gameData.currentRound.number !== input.roundNumber) {
      return {
        success: false,
        error: {
          status: START_ROUND_ERROR.INVALID_GAME_STATE,
          currentState: JSON.stringify(gameData),
          validationErrors: [],
        },
      };
    }

    const validationResult = checkRoundStartRules(gameData);

    if (!validationResult.valid) {
      return {
        success: false,
        error: {
          status: START_ROUND_ERROR.INVALID_GAME_STATE,
          currentState: gameData.status,
          validationErrors: validationResult.errors,
        },
      };
    }

    const updatedRound = await dependencies.lobbyHandler(async (ops) => {
      return await ops.startRound(validationResult.data);
    });

    return {
      success: true,
      data: {
        roundNumber: updatedRound.roundNumber,
        status: updatedRound.status,
      },
    };
  };
};

export type StartRoundService = ReturnType<typeof startRoundService>;
