import {
  ClueCreator,
  TurnGuessUpdater,
} from "@backend/shared/data-access/repositories/turns.repository";
import type { validate, validateClueWord } from "./give-clue.rules";
import type { GameAggregate } from "@backend/game/state/types";
import { getCurrentTurn } from "@backend/game/state/helpers";
import { UnexpectedGameplayError } from "../../errors/gameplay.errors";
import type { ActingPlayer } from "../types";

/**
 * Result of attempting to give a clue.
 *
 * `ok: false` is for expected business failures (invalid clue word,
 * wrong game state). Genuine internal failures throw
 * UnexpectedGameplayError → 500 via middleware.
 */
export type GiveClueActionResult =
  | {
      ok: true;
      data: {
        clue: Awaited<ReturnType<ClueCreator>>;
        turn: Awaited<ReturnType<TurnGuessUpdater>>;
      };
    }
  | { ok: false; message: string };

/**
 * Factory function that creates a self-validating clue giving action.
 * Returns a Result; expected failures are values, not exceptions.
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
  ): Promise<GiveClueActionResult> => {
    const clueWordResult = validateClueWordFn(gameState, word);
    if (!clueWordResult.valid) {
      return { ok: false, message: clueWordResult.error! };
    }

    const validation = validateGiveClue(gameState, player._teamId);
    if (!validation.valid) {
      return {
        ok: false,
        message: validation.errors.map((e) => e.message).join(", "),
      };
    }

    const currentTurn = getCurrentTurn(validation.data);
    if (!currentTurn) {
      // Invariant: validated state should have an active turn. If we hit
      // this, something is wrong internally — not a business failure.
      throw new UnexpectedGameplayError("No active turn found");
    }

    const clue = await createClue(currentTurn._id, { word, targetCardCount });

    const allowedGuesses = targetCardCount + 1;

    const unselectedCards = (validation.data as GameAggregate).currentRound!.cards.filter(
      (card) => !card.selected,
    );
    if (allowedGuesses > unselectedCards.length) {
      // Invariant: clue count can't exceed remaining card count once
      // validation passed. Internal failure, not user-correctable here.
      throw new UnexpectedGameplayError(
        `Cannot allow ${allowedGuesses} guesses when only ${unselectedCards.length} cards remain`,
      );
    }

    const updatedTurn = await updateTurnGuesses(
      currentTurn._id,
      allowedGuesses,
    );

    return {
      ok: true,
      data: { clue, turn: updatedTurn },
    };
  };
};

export type ClueGiver = ReturnType<typeof giveClueToTurn>;
