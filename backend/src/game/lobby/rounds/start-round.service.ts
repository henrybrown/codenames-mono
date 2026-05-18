import type { LobbyAggregateLoader } from "../state";
import type { LobbyValidationError } from "../state/validation";
import type { TransactionalHandler } from "@backend/shared/data-access/transaction-handler";
import type { LobbyOperations } from "../lobby-actions";

import { validate as checkRoundStartRules } from "./start-round.rules";

/** Input to the start-round service. */
export type StartRoundInput = {
  gameId: string;
  roundNumber: number;
  userId: number;
};

/** Successful start-round payload — the updated round number and status. */
export type StartRoundSuccess = {
  roundNumber: number;
  status: string;
};

/** Tagged result for the start-round service. */
export type StartRoundResult =
  | { success: true; data: StartRoundSuccess }
  | {
      success: false;
      message: string;
      notFound?: boolean;
      conflict?: boolean;
      validationErrors?: LobbyValidationError[];
    };

/** Wiring dependencies for the start-round service. */
export type StartRoundDependencies = {
  loadLobbyAggregate: LobbyAggregateLoader;
  lobbyHandler: TransactionalHandler<LobbyOperations>;
};

/**
 * Builds the start-round service.
 *
 * Loads the lobby, verifies permission and that `roundNumber` matches
 * the current round, validates the start-round rules, then transitions
 * the round and seeds the first turn transactionally.
 */
export const startRoundService = (dependencies: StartRoundDependencies) => {
  return async (input: StartRoundInput): Promise<StartRoundResult> => {
    const lobbyState = await dependencies.loadLobbyAggregate(input.gameId, input.userId);

    if (!lobbyState) {
      return {
        success: false,
        notFound: true,
        message: `Game ${input.gameId} not found`,
      };
    }

    if (!lobbyState.userContext.canModifyGame) {
      return {
        success: false,
        message: "You do not have permission to modify this game",
      };
    }

    const gameData = lobbyState;

    if (!gameData.currentRound) {
      return {
        success: false,
        notFound: true,
        message: `Round ${input.roundNumber} not found`,
      };
    }

    if (gameData.currentRound.number !== input.roundNumber) {
      return {
        success: false,
        conflict: true,
        message: `Round ${input.roundNumber} is not the current round (current is ${gameData.currentRound.number})`,
      };
    }

    const validationResult = checkRoundStartRules(gameData);

    if (!validationResult.valid) {
      return {
        success: false,
        conflict: true,
        message: validationResult.errors.map((e) => e.message).join(", "),
        validationErrors: validationResult.errors,
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

/** Service-call signature for starting a round. */
export type StartRoundService = ReturnType<typeof startRoundService>;
