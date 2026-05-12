import type { LobbyAggregateLoader } from "../state";
import type { LobbyValidationError } from "../state/validation";
import type { TransactionalHandler } from "@backend/shared/data-access/transaction-handler";
import type { LobbyOperations } from "../lobby-actions";

import { validate as checkRoundCreationRules } from "./new-round.rules";
import { validate as checkRoleAssignmentRules } from "./assign-roles.rules";
import { validate as checkCardDealingRules } from "./deal-cards.rules";
import { UnexpectedLobbyError } from "../errors/lobby.errors";

/**
 * Input parameters for round creation
 */
export type RoundCreationInput = {
  gameId: string;
  userId: number;
};

/**
 * Successful round creation result
 */
export type RoundCreationSuccess = {
  _id: number;
  roundNumber: number;
  _gameId: number;
  createdAt: Date;
  status: string;
  cards: Array<{
    _id: number;
    _roundId: number;
    word: string;
    cardType: string;
    _teamId: number | null;
    teamName?: string | null;
    selected: boolean;
  }>;
};

/**
 * Combined result type for round creation
 */
export type RoundCreationResult =
  | { success: true; data: RoundCreationSuccess }
  | {
      success: false;
      message: string;
      notFound?: boolean;
      conflict?: boolean;
      validationErrors?: LobbyValidationError[];
    };

/**
 * Dependencies required by the round creation service
 */
export type RoundCreationDependencies = {
  loadLobbyAggregate: LobbyAggregateLoader;
  lobbyHandler: TransactionalHandler<LobbyOperations>;
};

/**
 * Creates a service for handling round creation with business rule validation
 *
 * @param dependencies - Required external dependencies
 * @returns Service function for creating rounds
 */
export const roundCreationService = (dependencies: RoundCreationDependencies) => {
  return async (input: RoundCreationInput): Promise<RoundCreationResult> => {
    const lobbyState = await dependencies.loadLobbyAggregate(input.gameId, input.userId);

    if (!lobbyState) {
      return {
        success: false,
        notFound: true,
        message: `Game ${input.gameId} not found`,
      };
    }

    // Check if user can modify game (basic permission check)
    if (!lobbyState.userContext.canModifyGame) {
      return {
        success: false,
        message: "You do not have permission to modify this game",
      };
    }

    const gameData = lobbyState;

    const validationResult = checkRoundCreationRules(gameData);

    if (!validationResult.valid) {
      return {
        success: false,
        conflict: true,
        message: validationResult.errors.map((e) => e.message).join(", "),
        validationErrors: validationResult.errors,
      };
    }

    const operationResult = await dependencies.lobbyHandler(async (ops) => {
      const newRound = await ops.createRound(validationResult.data);

      // Get fresh lobby state after round creation to validate card dealing
      let currentState = await ops.loadLobbyAggregate(input.gameId, input.userId);

      if (!currentState) {
        throw new UnexpectedLobbyError("Failed to get lobby state after round creation");
      }

      // Deal cards
      const dealValidation = checkCardDealingRules(currentState);
      if (!dealValidation.valid) {
        throw new UnexpectedLobbyError(`Cannot deal cards: ${dealValidation.errors[0].message}`);
      }

      await ops.dealCards(dealValidation.data);

      // Get fresh state again after dealing cards
      currentState = await ops.loadLobbyAggregate(input.gameId, input.userId);

      if (!currentState) {
        throw new UnexpectedLobbyError("Failed to get lobby state after dealing cards");
      }

      // Assign roles
      const validatedForRoles = checkRoleAssignmentRules(currentState);
      if (!validatedForRoles.valid) {
        throw new UnexpectedLobbyError(
          `Cannot assign roles: ${validatedForRoles.errors[0].message}`,
        );
      }

      await ops.assignPlayerRoles(validatedForRoles.data);

      // Get final state to return full round data
      const finalState = await ops.loadLobbyAggregate(input.gameId, input.userId);

      if (!finalState || !finalState.currentRound) {
        throw new UnexpectedLobbyError("Failed to get final lobby state");
      }

      return {
        _id: newRound._id,
        roundNumber: newRound.roundNumber,
        _gameId: newRound._gameId,
        createdAt: newRound.createdAt,
        status: finalState.currentRound.status,
        cards: finalState.currentRound.cards || [],
      };
    });

    return {
      success: true,
      data: operationResult,
    };
  };
};

export type RoundCreationService = ReturnType<typeof roundCreationService>;
