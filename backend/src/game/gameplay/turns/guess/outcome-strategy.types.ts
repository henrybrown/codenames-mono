/**
 * Tagged union describing what should happen after a guess.
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
