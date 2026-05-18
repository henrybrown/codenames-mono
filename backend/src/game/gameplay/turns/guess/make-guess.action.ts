import {
  CODEBREAKER_OUTCOME,
  GAME_EVENT_TYPE,
  type TurnOutcome,
} from "@codenames/shared/types";
import { UnexpectedGameplayError } from "../../errors/gameplay.errors";
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
 * Result of attempting a guess.
 *
 * `ok: false` is for expected business failures (invalid card, wrong
 * game state); invariant violations throw `UnexpectedGameplayError`.
 */
export type MakeGuessActionResult =
  | {
      ok: true;
      data: {
        card: any;
        guess: Awaited<ReturnType<GuessCreator>>;
        turn: Awaited<ReturnType<TurnGuessUpdater>>;
        outcome: TurnOutcome;
        createdAt: Date;
      };
    }
  | { ok: false; message: string };

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

function determineOutcome(card: any, guessingTeamId: number): TurnOutcome {
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
      throw new UnexpectedGameplayError(`Unknown card type: ${card.cardType}`);
  }
}

/**
 * Builds the make-guess action.
 *
 * Validates the aggregate + the target card, flips the card to selected,
 * derives the outcome (correct team / other team / bystander / assassin),
 * persists the guess, updates remaining guesses, and writes a SELECT
 * event. Returns the new guess plus the updated turn.
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
  ): Promise<MakeGuessActionResult> => {
    const validation = deps.validateMakeGuess(gameState, player._teamId);
    if (!validation.valid) {
      return {
        ok: false,
        message: validation.errors.map((e) => e.message).join(", "),
      };
    }

    const cardValidation = validateGuessCard(gameState, cardWord);
    if (!cardValidation.valid) {
      return { ok: false, message: cardValidation.error! };
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
      ok: true,
      data: {
        card,
        guess,
        turn: updatedTurn,
        outcome,
        createdAt: guess.createdAt,
      },
    };
  };
};

/** Bound make-guess action. */
export type MakeGuessAction = ReturnType<typeof createMakeGuessAction>;
