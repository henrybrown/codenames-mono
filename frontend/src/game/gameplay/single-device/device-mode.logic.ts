/**
 * @deprecated Single-device handoff decisions are now made by `deriveHandoffView`
 * in `./handoff.rules.ts`. This shim is kept so the existing
 * device-mode.logic.test.ts continues to express the single-device handoff
 * rule in isolation. New code should consume `deriveHandoffView`.
 */
import { deriveHandoffView } from "./handoff.rules";
import type { ClaimedPhase } from "../providers/active-game-session-provider";
import type { TurnPhase } from "@frontend/shared/types";

export function needsHandoff(
  active: TurnPhase | null,
  claimedPhase: ClaimedPhase | null,
  isMultiDevice: boolean,
): boolean {
  // Multi-device skips handoff entirely; AI turns are owned by AiTurnOverlay,
  // not the handoff overlay — so only 'handoff' counts here.
  if (isMultiDevice) return false;
  return deriveHandoffView(active, claimedPhase) === "handoff";
}
