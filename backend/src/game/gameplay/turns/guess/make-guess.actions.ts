import {
  CODEBREAKER_OUTCOME,
  GAME_EVENT_TYPE,
} from "@codenames/shared/types";
import { GameplayValidationError } from "../../errors/gameplay.errors";
import { GameAggregate } from "@backend/game/state/types";
import type { validateMakeGuess } from "./make-guess.rules";
import { CardUpdater } from "@backend/shared/data-access/repositories/cards.repository";
import {
  GuessCreator,
  TurnGuessUpdater,
} from "@backend/shared/data-access/repositories/turns.repository";
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

export type MakeGuessAction = ReturnType<typeof createMakeGuessAction>;
