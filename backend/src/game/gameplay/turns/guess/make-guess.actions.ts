import {
  ROUND_STATE,
  CODEBREAKER_OUTCOME,
  GAME_STATE,
  GAME_EVENT_TYPE,
} from "@codenames/shared/types";
import { GameplayValidationError } from "../../errors/gameplay.errors";
import { GameAggregate } from "@backend/game/state/types";
import type {
  validateMakeGuess,
  validateEndTurn,
  validateStartTurn,
  validateEndRound,
} from "./make-guess.rules";
import { CardUpdater } from "@backend/shared/data-access/repositories/cards.repository";
import {
  GuessCreator,
  TurnGuessUpdater,
  TurnStatusUpdater,
  TurnCreator,
} from "@backend/shared/data-access/repositories/turns.repository";
import {
  RoundStatusUpdater,
  RoundWinnerUpdater,
} from "@backend/shared/data-access/repositories/rounds.repository";

import { GameStatusUpdater } from "@backend/shared/data-access/repositories/games.repository";
import type { CreateEventInput } from "@backend/shared/data-access/repositories/game-events.repository";

import { getCurrentTurnOrThrow } from "@backend/game/state/helpers";
import type { ActingPlayer } from "../types";

/**
 * Validates a specific card can be guessed
 */
function validateGuessCard(
  game: GameAggregate,
  cardWord: string,
): { valid: boolean; error?: string; cardId?: number } {
  if (!game.currentRound?.cards) {
    return { valid: false, error: "No cards available to guess" };
  }

  const targetCard = game.currentRound.cards.find(
    (card) => card.word.toLowerCase() === cardWord.toLowerCase().trim(),
  );

  if (!targetCard) {
    return { valid: false, error: `Card "${cardWord}" not found on the board` };
  }

  if (targetCard.selected) {
    return {
      valid: false,
      error: `Card "${cardWord}" has already been selected`,
    };
  }

  return { valid: true, cardId: targetCard._id };
}

/**
 * Helper for determining guess outcome based on card and team
 */
function determineOutcome(card: any, guessingTeamId: number): string {
  switch (card.cardType) {
    case "ASSASSIN":
      return CODEBREAKER_OUTCOME.ASSASSIN_CARD;
    case "BYSTANDER":
      return CODEBREAKER_OUTCOME.BYSTANDER_CARD;
    case "TEAM":
      return card._teamId === guessingTeamId
        ? CODEBREAKER_OUTCOME.CORRECT_TEAM_CARD
        : CODEBREAKER_OUTCOME.OTHER_TEAM_CARD;
    default:
      throw new Error(`Unknown card type: ${card.cardType}`);
  }
}

/**
 * Creates the make guess action
 */
export const createMakeGuessAction = (deps: {
  updateCards: CardUpdater;
  createGuess: GuessCreator;
  updateTurnGuesses: TurnGuessUpdater;
  createEvent: (event: CreateEventInput) => Promise<any>;
  validateMakeGuess: typeof validateMakeGuess;
}) => {
  return async (
    gameState: GameAggregate,
    player: ActingPlayer,
    cardWord: string,
  ) => {
    const validation = deps.validateMakeGuess(gameState, player._teamId);
    if (!validation.valid) {
      throw new GameplayValidationError("make guess", validation.errors);
    }

    const cardValidation = validateGuessCard(gameState, cardWord);
    if (!cardValidation.valid) {
      throw new GameplayValidationError("guess card", [
        { path: "cardWord", message: cardValidation.error! },
      ]);
    }

    const currentTurn = getCurrentTurnOrThrow(gameState);
    const [card] = await deps.updateCards([cardValidation.cardId!], {
      selected: true,
    });

    const outcome = determineOutcome(card, player._teamId);

    const newGuessesRemaining =
      outcome === CODEBREAKER_OUTCOME.CORRECT_TEAM_CARD
        ? Math.max(0, currentTurn.guessesRemaining - 1)
        : 0;

    const guess = await deps.createGuess({
      turnId: currentTurn._id,
      playerId: player._id,
      cardId: cardValidation.cardId!,
      outcome,
    });

    const updatedTurn = await deps.updateTurnGuesses(
      currentTurn._id,
      newGuessesRemaining,
    );

    await deps.createEvent({
      gameId: gameState._id,
      eventType: GAME_EVENT_TYPE.SELECT,
      cardId: cardValidation.cardId!,
      playerId: player._id,
      roundId: gameState.currentRound?._id,
      metadata: {
        cardWord: card.word,
        teamName: card.teamName,
        outcome,
      },
    });

    return {
      card,
      guess,
      turn: updatedTurn,
      outcome,
      createdAt: guess.createdAt,
    };
  };
};

/**
 * Creates the end turn action
 */
export const createEndTurnAction = (deps: {
  updateTurnStatus: TurnStatusUpdater;
  validateEndTurn: typeof validateEndTurn;
}) => {
  return async (gameState: GameAggregate, turnId: number) => {
    const validation = deps.validateEndTurn(gameState);
    if (!validation.valid) {
      throw new GameplayValidationError("end turn", validation.errors);
    }

    return await deps.updateTurnStatus(turnId, "COMPLETED");
  };
};

/**
 * Creates the start turn action
 */
export const createStartTurnAction = (deps: {
  createTurn: TurnCreator;
  validateStartTurn: typeof validateStartTurn;
}) => {
  return async (gameState: GameAggregate, roundId: number, teamId: number) => {
    const validation = deps.validateStartTurn(gameState);
    if (!validation.valid) {
      throw new GameplayValidationError("start turn", validation.errors);
    }

    return await deps.createTurn({
      roundId,
      teamId,
      guessesRemaining: 0,
    });
  };
};

/**
 * Creates the end round action
 */
export const createEndRoundAction = (deps: {
  updateRoundStatus: RoundStatusUpdater;
  updateRoundWinner: RoundWinnerUpdater;
  validateEndRound: typeof validateEndRound;
}) => {
  return async (
    gameState: GameAggregate,
    roundId: number,
    winningTeamId: number,
  ) => {
    const validation = deps.validateEndRound(gameState);
    if (!validation.valid) {
      throw new GameplayValidationError("end round", validation.errors);
    }

    await deps.updateRoundStatus({
      roundId,
      status: ROUND_STATE.COMPLETED,
    });

    return await deps.updateRoundWinner({
      roundId,
      winningTeamId,
    });
  };
};

/**
 * Creates the end game action that transitions game to completed state
 */
export const createEndGameAction = (updateGameStatus: GameStatusUpdater) => {
  /**
   * Ends the game by updating its status to COMPLETED
   *
   * @param gameState - Current game state
   * @param winningTeamId - ID of the team that won
   * @returns Updated game data with COMPLETED status
   */
  return async (gameState: GameAggregate, winningTeamId: number) => {
    return await updateGameStatus(gameState._id, GAME_STATE.COMPLETED);
  };
};

export type MakeGuessAction = ReturnType<typeof createMakeGuessAction>;
export type EndTurnAction = ReturnType<typeof createEndTurnAction>;
export type StartTurnAction = ReturnType<typeof createStartTurnAction>;
export type EndRoundAction = ReturnType<typeof createEndRoundAction>;
