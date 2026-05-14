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
 * `ok: false` is for expected business failures (round not in progress).
 * Genuine internal failures throw → 500 via middleware.
 */
export type EndRoundActionResult =
  | { ok: true; data: Awaited<ReturnType<RoundWinnerUpdater>> }
  | { ok: false; message: string };

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
export type EndRoundAction = ReturnType<typeof createEndRoundAction>;
