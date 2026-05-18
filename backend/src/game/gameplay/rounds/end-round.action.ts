import { ROUND_STATE } from "@codenames/shared/types";
import type { GameAggregate } from "@backend/game/state/types";
import type {
  RoundStatusUpdater,
  RoundWinnerUpdater,
} from "@backend/shared/data-access/repositories/rounds.repository";
import type { validateEndRound } from "./end-round.rules";

/**
 * Result of attempting to end a round.
 *
 * `ok: false` is for expected business failures (e.g. round already
 * completed). Invariant violations are thrown — not returned — so a
 * successful return implies the action ran to completion.
 */
export type EndRoundActionResult =
  | { ok: true; data: Awaited<ReturnType<RoundWinnerUpdater>> }
  | { ok: false; message: string };

/**
 * Builds the end-round action — validates the aggregate, then writes the
 * completed status and the winning team to the round row in that order.
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
  ): Promise<EndRoundActionResult> => {
    const validation = deps.validateEndRound(gameState);
    if (!validation.valid) {
      return {
        ok: false,
        message: validation.errors.map((e) => e.message).join(", "),
      };
    }
    await deps.updateRoundStatus({ roundId, status: ROUND_STATE.COMPLETED });
    const updated = await deps.updateRoundWinner({ roundId, winningTeamId });
    return { ok: true, data: updated };
  };
};
/** Bound end-round action. */
export type EndRoundAction = ReturnType<typeof createEndRoundAction>;
