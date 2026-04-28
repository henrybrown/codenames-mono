import type { VisibilityContext } from "../dashboard/config/context";

/**
 * The post-turn window: a turn has completed and the next one has not yet
 * started. Universal — true in both single- and multi-device games.
 *
 * While this is true, the dashboard renders:
 *   - TurnOutcomePanel (presentational)
 *   - DotCountdown    (presentational timer)
 *   - NextTurnTrigger (side effect — fires startTurn after the countdown)
 *
 * When NextTurnTrigger fires, the server creates the next active turn,
 * `hasActiveTurn` flips to true, and this returns false. The window has closed.
 *
 * Note: this is the ONLY signal for "are we in the post-turn window".
 * Do NOT add a hasRole / claimedPhase / mode check here. Those concerns
 * belong to the handoff flow, which is a separate file.
 */
export function isPostTurn(ctx: VisibilityContext): boolean {
  return (
    ctx.roundStatus === "IN_PROGRESS" &&
    ctx.hasRound &&
    !ctx.hasActiveTurn &&
    ctx.lastCompletedTurn !== null
  );
}
