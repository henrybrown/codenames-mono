import type { LobbyStateProvider } from "../state";
import type { LobbyValidationError } from "../state/validation";
import type { TransactionalHandler } from "@backend/shared/data-access/transaction-handler";
import type { LobbyOperations } from "../lobby-actions";
import type { CardResult } from "@backend/shared/data-access/repositories/cards.repository";
import { GameEventsEmitter } from "@backend/shared/websocket";

import { validate as checkCardDealingRules } from "./deal-cards.rules";

/**
 * Input parameters for dealing cards
 */
export type DealCardsInput = {
  gameId: string;
  userId: number;
  redeal?: boolean;
};

/**
 * Successful card dealing result
 */
export type DealCardsSuccess = {
  _roundId: number;
  roundNumber: number;
  _startingTeamId: number;
  cards: CardResult[];
};

/**
 * Card dealing error types
 */
export const DEAL_CARDS_ERROR = {
  INVALID_GAME_STATE: "invalid-game-state",
  GAME_NOT_FOUND: "game-not-found",
  USER_NOT_PLAYER: "user-not-player",
} as const;

/**
 * Card dealing failure details
 */
export type DealCardsFailure =
  | {
      status: typeof DEAL_CARDS_ERROR.INVALID_GAME_STATE;
      currentState: string;
      validationErrors: LobbyValidationError[];
    }
  | {
      status: typeof DEAL_CARDS_ERROR.GAME_NOT_FOUND;
      gameId: string;
    }
  | {
      status: typeof DEAL_CARDS_ERROR.USER_NOT_PLAYER;
      gameId: string;
      userId: number;
    };

/**
 * Combined result type for card dealing
 */
export type DealCardsResult =
  | { success: true; data: DealCardsSuccess }
  | { success: false; error: DealCardsFailure };

/**
 * Dependencies required by the deal cards service
 */
export type DealCardsDependencies = {
  getLobbyState: LobbyStateProvider;
  lobbyHandler: TransactionalHandler<LobbyOperations>;
};

/**
 * Creates a service for handling card dealing with business rule validation
 *
 * @param dependencies - Required external dependencies
 * @returns Service function for dealing cards
 */
export const dealCardsService = (dependencies: DealCardsDependencies) => {
  return async (input: DealCardsInput): Promise<DealCardsResult> => {
    const lobbyState = await dependencies.getLobbyState(input.gameId, input.userId);

    if (!lobbyState) {
      return {
        success: false,
        error: {
          status: DEAL_CARDS_ERROR.GAME_NOT_FOUND,
          gameId: input.gameId,
        },
      };
    }

    // Check if user can modify game (basic permission check)
    if (!lobbyState.userContext.canModifyGame) {
      return {
        success: false,
        error: {
          status: DEAL_CARDS_ERROR.USER_NOT_PLAYER,
          gameId: input.gameId,
          userId: input.userId,
        },
      };
    }

    const gameData = lobbyState;

    // Pass redeal flag in context for validation
    const validationResult = checkCardDealingRules(gameData, { redeal: input.redeal });

    if (!validationResult.valid) {
      return {
        success: false,
        error: {
          status: DEAL_CARDS_ERROR.INVALID_GAME_STATE,
          currentState: gameData.status,
          validationErrors: validationResult.errors,
        },
      };
    }

    const dealtCards = await dependencies.lobbyHandler(async (ops) => {
      return await ops.dealCards(validationResult.data);
    });

    // Emit WebSocket event for real-time multiplayer updates
    GameEventsEmitter.cardsDealt(input.gameId, dealtCards.roundNumber);

    return {
      success: true,
      data: {
        _roundId: dealtCards._roundId,
        roundNumber: dealtCards.roundNumber,
        _startingTeamId: dealtCards.startingTeam,
        cards: dealtCards.cards,
      },
    };
  };
};

export type DealCardsService = ReturnType<typeof dealCardsService>;
