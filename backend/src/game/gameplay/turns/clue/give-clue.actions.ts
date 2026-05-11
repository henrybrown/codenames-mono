import {
  ClueCreator,
  TurnGuessUpdater,
} from "@backend/shared/data-access/repositories/turns.repository";
import type { validate, validateClueWord } from "./give-clue.rules";
import type { GameAggregate } from "@backend/game/state/types";
import { getCurrentTurn } from "@backend/game/state/helpers";
import { UnexpectedGameplayError, GameplayValidationError } from "../../errors/gameplay.errors";
import type { ActingPlayer } from "../types";

/**
 * Factory function that creates a self-validating clue giving action.
 * Receives raw GameAggregate + acting player, validates internally, executes.
 */
export const giveClueToTurn = (
  createClue: ClueCreator,
  updateTurnGuesses: TurnGuessUpdater,
  validateGiveClue: typeof validate,
  validateClueWordFn: typeof validateClueWord,
) => {
  return async (
    gameState: GameAggregate,
    player: ActingPlayer,
    word: string,
    targetCardCount: number,
  ) => {
    const clueWordResult = validateClueWordFn(gameState, word);
    if (!clueWordResult.valid) {
      throw new GameplayValidationError("clue word", [
        { path: "word", message: clueWordResult.error! },
      ]);
    }

    const validation = validateGiveClue(gameState, player._teamId);
    if (!validation.valid) {
      throw new GameplayValidationError("give clue", validation.errors);
    }

    const currentTurn = getCurrentTurn(validation.data);
    if (!currentTurn) {
      throw new UnexpectedGameplayError("No active turn found");
    }

    const clue = await createClue(currentTurn._id, { word, targetCardCount });

    const allowedGuesses = targetCardCount + 1;

    const unselectedCards = (validation.data as GameAggregate).currentRound!.cards.filter(
      (card) => !card.selected,
    );
    if (allowedGuesses > unselectedCards.length) {
      throw new UnexpectedGameplayError(
        `Cannot allow ${allowedGuesses} guesses when only ${unselectedCards.length} cards remain`,
      );
    }

    const updatedTurn = await updateTurnGuesses(
      currentTurn._id,
      allowedGuesses,
    );

    return {
      clue,
      turn: updatedTurn,
    };
  };
};

export type ClueGiver = ReturnType<typeof giveClueToTurn>;
