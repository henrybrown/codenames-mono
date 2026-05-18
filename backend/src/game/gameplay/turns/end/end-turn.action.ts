import type { GameAggregate } from "@backend/game/state/types";
import type { TurnStatusUpdater } from "@backend/shared/data-access/repositories/turns.repository";
import type { validateEndTurn } from "./end-turn.rules";

/**
 * Result of attempting to end a turn.
 *
 * `ok: false` is for expected business failures (round not in progress,
 * etc.); invariant violations throw `UnexpectedGameplayError`.
 */
export type EndTurnActionResult =
  | { ok: true; data: Awaited<ReturnType<TurnStatusUpdater>> }
  | { ok: false; message: string };

/**
 * Builds the end-turn action — validates the aggregate, then marks the
 * given turn COMPLETED.
 */
export const createEndTurnAction = (deps: {
  updateTurnStatus: TurnStatusUpdater;
  validateEndTurn: typeof validateEndTurn;
}) => {
  return async (
    gameState: GameAggregate,
    turnId: number,
  ): Promise<EndTurnActionResult> => {
    const validation = deps.validateEndTurn(gameState);
    if (!validation.valid) {
      return {
        ok: false,
        message: validation.errors.map((e) => e.message).join(", "),
      };
    }
    const updated = await deps.updateTurnStatus(turnId, "COMPLETED");
    return { ok: true, data: updated };
  };
};
/** Bound end-turn action. */
export type EndTurnAction = ReturnType<typeof createEndTurnAction>;
