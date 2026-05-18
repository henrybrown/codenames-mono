import type { LobbyAggregateLoader } from "../state";
import type { LobbyValidationError } from "../state/validation";
import type { TransactionalHandler } from "@backend/shared/data-access/transaction-handler";
import type { LobbyOperations } from "../lobby-actions";
import type { CardResult } from "@backend/shared/data-access/repositories/cards.repository";
import { GameEventsEmitter } from "@backend/shared/websocket";

import { validate as checkCardDealingRules } from "./deal-cards.rules";

/** Input to the deal-cards service — `redeal` opts into replacing cards. */
export type DealCardsInput = {
  gameId: string;
  userId: number;
  redeal?: boolean;
};

/** Successful deal-cards payload — the round id plus the new card list. */
export type DealCardsSuccess = {
  _roundId: number;
  roundNumber: number;
  _startingTeamId: number;
  cards: CardResult[];
};

/**
 * Tagged result for the deal-cards service.
 *
 * `validationErrors` carries the per-field flattened issues when the
 * schema rejected the lobby state, for richer client diagnostics.
 */
export type DealCardsResult =
  | { success: true; data: DealCardsSuccess }
  | {
      success: false;
      message: string;
      notFound?: boolean;
      conflict?: boolean;
      validationErrors?: LobbyValidationError[];
    };

/** Wiring dependencies for the deal-cards service. */
export type DealCardsDependencies = {
  loadLobbyAggregate: LobbyAggregateLoader;
  lobbyHandler: TransactionalHandler<LobbyOperations>;
};

/**
 * Builds the deal-cards service.
 *
 * Loads the lobby, checks the user's modify permission, validates the
 * dealing rules, then deals cards transactionally and broadcasts a
 * `cardsDealt` event.
 */
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

/** Service-call signature for dealing cards. */
export type DealCardsService = ReturnType<typeof dealCardsService>;
