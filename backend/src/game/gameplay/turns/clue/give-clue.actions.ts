import {
  ClueCreator,
  TurnGuessUpdater,
} from "@backend/shared/data-access/repositories/turns.repository";
import type { GiveClueValidGameState, validate, validateClueWord } from "./give-clue.rules";
import type { GameAggregate } from "@backend/game/gameplay/state/gameplay-state.types";
import { complexProperties } from "@backend/game/gameplay/state/gameplay-state.helpers";
import { UnexpectedGameplayError, GameplayValidationError } from "../../errors/gameplay.errors";

/**
 * Factory function that creates a self-validating clue giving action.
 * Receives raw GameAggregate, validates internally, then executes.
 */
export const giveClueToTurn = (
  createClue: ClueCreator,
  updateTurnGuesses: TurnGuessUpdater,
  validateGiveClue: typeof validate,
  validateClueWordFn: typeof validateClueWord,
) => {
  return async (
    gameState: GameAggregate,
    word: string,
    targetCardCount: number,
  ) => {
    // todo: remove numbered steps its nasty .... review across app for numbered steps
    // 1. Validate clue word against board
    const clueWordResult = validateClueWordFn(gameState, word);
    if (!clueWordResult.valid) {
      throw new GameplayValidationError("clue word", [
        { path: "word", message: clueWordResult.error! },
      ]);
    }

    // 2. Validate game state (role, turn, team)
    const validation = validateGiveClue(gameState);
    if (!validation.valid) {
      throw new GameplayValidationError("give clue", validation.errors);
    }

    // 3. Execute
    const currentTurn = complexProperties.getCurrentTurn(validation.data);
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
