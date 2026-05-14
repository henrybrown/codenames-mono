import { CODEBREAKER_OUTCOME } from "@codenames/shared/types";
import type { GameAggregate } from "@backend/game/state/types";
import { getOtherTeamId } from "@backend/game/state/helpers";
import { checkRoundWinner, checkGameWinner } from "../../rounds";
import { UnexpectedGameplayError } from "../../errors/gameplay.errors";

/**
 * Type describing what should happen after a guess.
 *
 * Pure data — `determineOutcomeStrategy` computes it from the post-guess
 * state; `make-guess.service` switches on the strategy and runs the
 * appropriate ops in sequence.
 *
 * The structure encodes the rules of the cascade:
 *   - end-turn implies turn ends only
 *   - end-round implies turn + round end
 *   - end-game implies turn + round + game end
 */
export type OutcomeStrategy =
  | { strategy: "continue" }
  | { strategy: "end-turn"; turnId: number }
  | {
      strategy: "end-round";
      turnId: number;
      roundId: number;
      roundWinningTeamId: number;
    }
  | {
      strategy: "end-game";
      turnId: number;
      roundId: number;
      roundWinningTeamId: number;
      gameWinningTeamId: number;
    };


/**
 * Pure derivation of what should happen after a guess got a given outcome.
 *
 * Takes the post-guess state (board reflects the just-selected card)
 * and the guess context (outcome category, turn id, etc.), returns a
 * strategy describing the cascade.
 *
 * No IO, no async, no ops. Trivially unit-testable.
 */
export const determineOutcomeStrategy = (input: {
  outcome: string; // CODEBREAKER_OUTCOME value
  turnId: number;
  guessingTeamId: number;
  guessesRemaining: number;
  postGuessState: GameAggregate;
}): OutcomeStrategy => {
  const { outcome, turnId, guessingTeamId, guessesRemaining, postGuessState } =
    input;
  const currentRound = postGuessState.currentRound;
  if (!currentRound) {
    throw new UnexpectedGameplayError(
      "determineOutcomeStrategy: post-guess state has no current round",
    );
  }

  switch (outcome) {
    case CODEBREAKER_OUTCOME.CORRECT_TEAM_CARD: {
      const otherTeamId = getOtherTeamId(postGuessState, guessingTeamId);
      const roundWinner = checkRoundWinner(
        currentRound.cards,
        guessingTeamId,
        otherTeamId,
      );
      if (roundWinner !== null) {
        return planRoundEnd(
          postGuessState,
          turnId,
          currentRound._id,
          roundWinner,
        );
      }
      if (guessesRemaining === 0) {
        return { strategy: "end-turn", turnId };
      }
      return { strategy: "continue" };
    }
    case CODEBREAKER_OUTCOME.OTHER_TEAM_CARD: {
      const otherTeamId = getOtherTeamId(postGuessState, guessingTeamId);
      const roundWinner = checkRoundWinner(
        currentRound.cards,
        guessingTeamId,
        otherTeamId,
      );
      if (roundWinner !== null) {
        return planRoundEnd(
          postGuessState,
          turnId,
          currentRound._id,
          roundWinner,
        );
      }
      return { strategy: "end-turn", turnId };
    }
    case CODEBREAKER_OUTCOME.BYSTANDER_CARD: {
      return { strategy: "end-turn", turnId };
    }
    case CODEBREAKER_OUTCOME.ASSASSIN_CARD: {
      const otherTeamId = getOtherTeamId(postGuessState, guessingTeamId);
      return planRoundEnd(postGuessState, turnId, currentRound._id, otherTeamId);
    }
    default:
      throw new UnexpectedGameplayError(`Unknown guess outcome: ${outcome}`);
  }
};

/**
 * Helper: given a round about to end with `roundWinningTeamId`, project
 * forward to see if the game also ends.
 *
 * checkGameWinner reads historicalRounds; the just-won round isn't in
 * historicalRounds yet (still in currentRound), so we synthesise the
 * eventual historical entry to ask the question.
 */
const planRoundEnd = (
  postGuessState: GameAggregate,
  turnId: number,
  roundId: number,
  roundWinningTeamId: number,
): OutcomeStrategy => {
  const projectedHistorical = [
    ...postGuessState.historicalRounds,
    {
      _id: roundId,
      number: postGuessState.currentRound?.number ?? 0,
      status: "COMPLETED" as const,
      _winningTeamId: roundWinningTeamId,
      winningTeamName: "", // unused by checkGameWinner
      createdAt: new Date(), // unused by checkGameWinner
    },
  ];
  const gameWinner = checkGameWinner(
    projectedHistorical,
    postGuessState.game_format,
  );
  if (gameWinner !== null) {
    return {
      strategy: "end-game",
      turnId,
      roundId,
      roundWinningTeamId,
      gameWinningTeamId: gameWinner,
    };
  }
  return {
    strategy: "end-round",
    turnId,
    roundId,
    roundWinningTeamId,
  };
};
