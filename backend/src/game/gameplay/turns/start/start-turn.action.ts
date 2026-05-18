import type { GameAggregate } from "@backend/game/state/types";
import type { TurnCreator } from "@backend/shared/data-access/repositories/turns.repository";
import type { validateStartTurn } from "./start-turn.rules";

/**
 * Result of attempting to start a turn.
 *
 * `ok: false` is for expected business failures (round not in progress,
 * etc.); invariant violations throw `UnexpectedGameplayError`.
 */
export type StartTurnActionResult =
  | { ok: true; data: Awaited<ReturnType<TurnCreator>> }
  | { ok: false; message: string };

/**
 * Builds the start-turn action — validates the aggregate, then creates a
 * new ACTIVE turn for the given team with zero guesses remaining (the
 * clue stage hasn't started yet).
 */
export const createStartTurnAction = (deps: {
  createTurn: TurnCreator;
  validateStartTurn: typeof validateStartTurn;
}) => {
  return async (
    gameState: GameAggregate,
    roundId: number,
    teamId: number,
  ): Promise<StartTurnActionResult> => {
    const validation = deps.validateStartTurn(gameState);
    if (!validation.valid) {
      return {
        ok: false,
        message: validation.errors.map((e) => e.message).join(", "),
      };
    }
    const created = await deps.createTurn({ roundId, teamId, guessesRemaining: 0 });
    return { ok: true, data: created };
  };
};
/** Bound start-turn action. */
export type StartTurnAction = ReturnType<typeof createStartTurnAction>;
