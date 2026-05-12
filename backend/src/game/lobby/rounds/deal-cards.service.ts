import type { LobbyAggregateLoader } from "../state";
import type { LobbyValidationError } from "../state/validation";
import type { TransactionalHandler } from "@backend/shared/data-access/transaction-handler";
import type { LobbyOperations } from "../lobby-actions";
import type { CardResult } from "@backend/shared/data-access/repositories/cards.repository";
import { GameEventsEmitter } from "@backend/shared/websocket";

import { validate as checkCardDealingRules } from "./deal-cards.rules";

export type DealCardsInput = {
  gameId: string;
  userId: number;
  redeal?: boolean;
};

export type DealCardsSuccess = {
  _roundId: number;
  roundNumber: number;
  _startingTeamId: number;
  cards: CardResult[];
};

export type DealCardsResult =
  | { success: true; data: DealCardsSuccess }
  | {
      success: false;
      message: string;
      notFound?: boolean;
      conflict?: boolean;
      validationErrors?: LobbyValidationError[];
    };

export type DealCardsDependencies = {
  loadLobbyAggregate: LobbyAggregateLoader;
  lobbyHandler: TransactionalHandler<LobbyOperations>;
};

export const dealCardsService = (dependencies: DealCardsDependencies) => {
  return async (input: DealCardsInput): Promise<DealCardsResult> => {
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

    const validationResult = checkCardDealingRules(lobbyState, { redeal: input.redeal });

    if (!validationResult.valid) {
      return {
        success: false,
        conflict: true,
        message: validationResult.errors.map((e) => e.message).join(", "),
        validationErrors: validationResult.errors,
      };
    }

    const dealtCards = await dependencies.lobbyHandler(async (ops) => {
      return await ops.dealCards(validationResult.data);
    });

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
